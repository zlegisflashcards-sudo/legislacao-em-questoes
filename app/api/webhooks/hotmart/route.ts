import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase-server";
import { diagnosticoHottok, registrarEventoHotmart, validarHottok } from "@/lib/hotmart/webhook";
import { notifyStudentAccess } from "@/lib/student-first-access-server";
import { createHash } from "node:crypto";
import { createOperationalAdminNotification } from "@/lib/admin-notification-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function hotmartFailureContext(payload: unknown) {
  const root = payload && typeof payload === "object" ? payload as Record<string, unknown> : {};
  const data = root.data && typeof root.data === "object" ? root.data as Record<string, unknown> : root;
  const purchase = data.purchase && typeof data.purchase === "object" ? data.purchase as Record<string, unknown> : data;
  const product = purchase.product && typeof purchase.product === "object" ? purchase.product as Record<string, unknown> : {};
  const transaction = String(purchase.transaction ?? purchase.transaction_id ?? data.transaction ?? root.transaction ?? "").trim();
  const productCode = String(product.id ?? product.code ?? purchase.product_id ?? data.product_id ?? "").trim();
  const status = String(purchase.status ?? data.status ?? root.event ?? "").trim();
  const eventId = transaction || createHash("sha256").update(JSON.stringify(payload)).digest("hex").slice(0, 32);
  return { transaction, productCode, status, eventId };
}

export async function POST(request: Request) {
  const hottokRecebido = request.headers.get("x-hotmart-hottok");
  const hottokConfigurado = process.env.HOTMART_HOTTOK;
  console.info("Diagnóstico Hottok Hotmart:", diagnosticoHottok(hottokRecebido, hottokConfigurado));

  if (!validarHottok(hottokRecebido, hottokConfigurado)) {
    return NextResponse.json({ success: false }, { status: 401 });
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ success: false, error: "Payload inválido." }, { status: 400 });
  }

  try {
    const supabase = getSupabaseServerClient();
    const result = await registrarEventoHotmart(supabase, payload, async (input) => {
      console.info("[hotmart-access-notification] acquisition_ready", { studentId: input.studentId, origin: input.origin, idempotencyKey: input.idempotencyKey });
      try {
        const outcome = await notifyStudentAccess(supabase, { ...input, notificationOrigin: "hotmart" });
        console.info("[hotmart-access-notification] completed", { studentId: input.studentId, outcome: outcome.reason });
      } catch (error) {
        const message = error instanceof Error ? error.message.replace(/senha[^.]*/gi, "credencial ocultada").slice(0, 500) : "Falha desconhecida";
        console.error("[hotmart-access-notification] failed", { studentId: input.studentId, origin: input.origin, idempotencyKey: input.idempotencyKey, message });
      }
    });
    return NextResponse.json({ success: true, duplicate: result.duplicate });
  } catch (error) {
    if (error instanceof Error && /payload inválido|sem identificador/i.test(error.message)) {
      return NextResponse.json({ success: false, error: "Payload inválido." }, { status: 400 });
    }
    const context = hotmartFailureContext(payload);
    const message = error instanceof Error ? error.message.replace(/senha|token|key/gi, "dado ocultado").slice(0, 500) : "Falha desconhecida";
    await createOperationalAdminNotification(getSupabaseServerClient(), {
      tipo: "erro_hotmart", titulo: "Falha no processamento da Hotmart",
      mensagem: `Transação: ${context.transaction || "não informada"}; produto: ${context.productCode || "não informado"}; status: ${context.status || "não informado"}; motivo: ${message}`,
      link: `/admin/comercial?tab=aquisicoes&q=${encodeURIComponent(context.transaction || context.productCode)}`,
      entidadeTipo: "erro_hotmart_evento", entidadeId: context.eventId,
    });
    console.error("Erro ao registrar webhook da Hotmart:", { transaction: context.transaction || null, productCode: context.productCode || null, status: context.status || null, message });
    return NextResponse.json({ success: false }, { status: 500 });
  }
}
