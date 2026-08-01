import "server-only";

import { timingSafeEqual } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";

export type HotmartPayload = {
  id?: string;
  event?: string;
  creation_date?: number;
  buyer?: { email?: string; name?: string };
  product?: { id?: number | string; name?: string };
  purchase?: {
    transaction?: string;
    status?: string;
    approved_date?: number;
    order_date?: number;
  };
};

export type AcquisitionStatus =
  | "active"
  | "cancelled"
  | "refunded"
  | "chargeback"
  | "pending";

export function validarHottok(recebido: string | null, esperado: string | undefined) {
  if (!recebido || !esperado) return false;
  const recebidoBuffer = Buffer.from(recebido);
  const esperadoBuffer = Buffer.from(esperado);
  return (
    recebidoBuffer.length === esperadoBuffer.length &&
    timingSafeEqual(recebidoBuffer, esperadoBuffer)
  );
}

export function mapearStatusHotmart(status?: string): AcquisitionStatus {
  switch (status?.toUpperCase()) {
    case "APPROVED":
    case "COMPLETE":
      return "active";
    case "CANCELLED":
      return "cancelled";
    case "REFUNDED":
    case "PARTIALLY_REFUNDED":
      return "refunded";
    case "CHARGEBACK":
      return "chargeback";
    default:
      return "pending";
  }
}

function dataHotmart(valor?: number) {
  return valor ? new Date(valor).toISOString() : null;
}

export async function processarEventoHotmart(
  supabase: SupabaseClient,
  payload: HotmartPayload,
) {
  const eventId = payload.id?.trim();
  const eventName = payload.event?.trim() || "UNKNOWN";
  const transactionId = payload.purchase?.transaction?.trim();

  if (!eventId) throw new Error("Evento Hotmart sem identificador.");

  const { data: existente, error: consultaEventoError } = await supabase
    .from("hotmart_webhook_events")
    .select("id,processing_status")
    .eq("hotmart_event_id", eventId)
    .maybeSingle();
  if (consultaEventoError) throw consultaEventoError;

  if (existente && existente.processing_status !== "error") {
    return { duplicate: true, acquisitionId: null };
  }

  let registroEventoId = existente?.id as string | undefined;
  if (registroEventoId) {
    const { error } = await supabase
      .from("hotmart_webhook_events")
      .update({ processing_status: "processing", error_message: null, payload })
      .eq("id", registroEventoId);
    if (error) throw error;
  } else {
    const { data, error } = await supabase
      .from("hotmart_webhook_events")
      .insert({
        hotmart_event_id: eventId,
        event_name: eventName,
        transaction_id: transactionId || null,
        payload,
        processing_status: "processing",
      })
      .select("id")
      .single();
    if (error?.code === "23505") return { duplicate: true, acquisitionId: null };
    if (error) throw error;
    registroEventoId = data.id as string;
  }

  try {
    const acquisitionId = await registrarAquisicao(supabase, payload);
    const { error } = await supabase
      .from("hotmart_webhook_events")
      .update({ processing_status: "processed", processed_at: new Date().toISOString() })
      .eq("id", registroEventoId);
    if (error) throw error;
    return { duplicate: false, acquisitionId };
  } catch (error) {
    await supabase
      .from("hotmart_webhook_events")
      .update({
        processing_status: "error",
        error_message: error instanceof Error ? error.message.slice(0, 1000) : "Erro desconhecido",
      })
      .eq("id", registroEventoId);
    throw error;
  }
}

async function registrarAquisicao(
  supabase: SupabaseClient,
  payload: HotmartPayload,
) {
  const transactionId = payload.purchase?.transaction?.trim();
  if (!transactionId) throw new Error("Evento Hotmart sem transação.");

  const status = mapearStatusHotmart(payload.purchase?.status);
  const agora = new Date().toISOString();
  const statusDatas = {
    cancelled_at: status === "cancelled" ? agora : null,
    refunded_at: status === "refunded" || status === "chargeback" ? agora : null,
  };

  const { data: aquisicaoExistente, error: aquisicaoError } = await supabase
    .from("acquisitions")
    .select("id,student_id,product_id")
    .eq("external_transaction_id", transactionId)
    .maybeSingle();
  if (aquisicaoError) throw aquisicaoError;

  if (aquisicaoExistente) {
    const { error } = await supabase
      .from("acquisitions")
      .update({ status, ...statusDatas })
      .eq("id", aquisicaoExistente.id);
    if (error) throw error;
    return aquisicaoExistente.id as string;
  }

  const email = payload.buyer?.email?.trim().toLowerCase();
  const productHotmartId = String(payload.product?.id ?? "").trim();
  const productName = payload.product?.name?.trim();
  if (!email || !productHotmartId || !productName) {
    throw new Error("Evento Hotmart sem comprador ou produto completo.");
  }

  const studentId = await localizarOuCriarAluno(supabase, email, payload.buyer?.name);
  const productId = await localizarOuCriarProduto(supabase, productHotmartId, productName);
  const purchasedAt = dataHotmart(
    payload.purchase?.approved_date ?? payload.purchase?.order_date ?? payload.creation_date,
  );

  const { data: aquisicao, error: insertError } = await supabase
    .from("acquisitions")
    .insert({
      student_id: studentId,
      product_id: productId,
      hotmart_product_id: productHotmartId,
      product_name: productName,
      purchased_at: purchasedAt,
      status,
      origin: "hotmart",
      external_transaction_id: transactionId,
      ...statusDatas,
    })
    .select("id")
    .single();
  if (insertError) throw insertError;

  const { data: leis, error: leisError } = await supabase
    .from("product_laws")
    .select("law_slug")
    .eq("product_id", productId);
  if (leisError) throw leisError;
  if (leis?.length) {
    const { error } = await supabase.from("acquisition_laws").insert(
      leis.map(({ law_slug }) => ({ acquisition_id: aquisicao.id, law_slug })),
    );
    if (error) throw error;
  }

  return aquisicao.id as string;
}

async function localizarOuCriarAluno(
  supabase: SupabaseClient,
  email: string,
  fullName?: string,
) {
  const { data, error } = await supabase
    .from("student_profiles")
    .select("id")
    .eq("email", email)
    .maybeSingle();
  if (error) throw error;
  if (data) return data.id as string;

  const { data: criado, error: createError } = await supabase
    .from("student_profiles")
    .insert({ email, full_name: fullName?.trim() || null, status: "pending", origin: "hotmart" })
    .select("id")
    .single();
  if (createError) throw createError;
  return criado.id as string;
}

async function localizarOuCriarProduto(
  supabase: SupabaseClient,
  hotmartProductId: string,
  productName: string,
) {
  const { data, error } = await supabase
    .from("products_catalog")
    .select("id")
    .eq("hotmart_product_id", hotmartProductId)
    .maybeSingle();
  if (error) throw error;
  if (data) return data.id as string;

  const { data: criado, error: createError } = await supabase
    .from("products_catalog")
    .insert({ hotmart_product_id: hotmartProductId, name: productName, product_type: "unmapped" })
    .select("id")
    .single();
  if (createError) throw createError;
  return criado.id as string;
}
