import { timingSafeEqual } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";

export type HotmartPayload = Record<string, unknown> & {
  id?: unknown;
  event?: unknown;
  creation_date?: unknown;
  data?: HotmartDados;
  buyer?: { email?: unknown; name?: unknown };
  product?: { id?: unknown; name?: unknown };
  purchase?: { transaction?: unknown; status?: unknown };
};

type HotmartDados = {
  buyer?: { email?: unknown; name?: unknown; checkout_phone?: unknown };
  product?: { id?: unknown; name?: unknown };
  purchase?: { transaction?: unknown; status?: unknown; approved_date?: unknown };
};

export type EventoHotmartNormalizado = {
  identificador_evento: string;
  codigo_transacao: string | null;
  hotmart_product_id: string | null;
  tipo_evento: string | null;
  status_transacao: string | null;
  email_comprador: string | null;
};

function texto(valor: unknown) {
  return typeof valor === "string" && valor.trim() ? valor.trim() : null;
}

export function validarHottok(recebido: string | null, esperado: string | undefined) {
  if (!recebido || !esperado) return false;
  const recebidoBuffer = Buffer.from(recebido);
  const esperadoBuffer = Buffer.from(esperado);
  return recebidoBuffer.length === esperadoBuffer.length && timingSafeEqual(recebidoBuffer, esperadoBuffer);
}

export function diagnosticoHottok(recebido: string | null, configurado: string | undefined) {
  return {
    hottokRecebido: Boolean(recebido),
    hottokConfigurado: Boolean(configurado),
    tamanhoRecebido: recebido?.length ?? 0,
    tamanhoConfigurado: configurado?.length ?? 0,
  };
}

export function normalizarEventoHotmart(payload: unknown): EventoHotmartNormalizado {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new Error("Payload inválido.");
  }

  const evento = payload as HotmartPayload;
  const identificadorEvento = texto(evento.id);
  if (!identificadorEvento) throw new Error("Evento Hotmart sem identificador.");

  const dados = evento.data && typeof evento.data === "object" && !Array.isArray(evento.data)
    ? evento.data
    : evento;
  const produtoId = dados.product?.id;
  return {
    identificador_evento: identificadorEvento,
    codigo_transacao: texto(dados.purchase?.transaction),
    hotmart_product_id: produtoId === undefined || produtoId === null ? null : String(produtoId).trim() || null,
    tipo_evento: texto(evento.event) ?? "UNKNOWN",
    status_transacao: texto(dados.purchase?.status),
    email_comprador: texto(dados.buyer?.email)?.toLowerCase() ?? null,
  };
}

export async function registrarEventoHotmart(supabase: SupabaseClient, payload: unknown) {
  const normalizado = normalizarEventoHotmart(payload);
  const { error } = await supabase.from("hotmart_eventos").insert({
    ...normalizado,
    hotmart_event_id: normalizado.identificador_evento,
    evento: normalizado.tipo_evento,
    hotmart_transaction_id: normalizado.codigo_transacao,
    payload,
    payload_bruto: payload,
    payload_normalizado: normalizado,
  });

  if (error?.code === "23505") return { duplicate: true };
  if (error) throw error;
  return { duplicate: false };
}
