import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase-server";
import { diagnosticoHottok, registrarEventoHotmart, validarHottok } from "@/lib/hotmart/webhook";
import { notifyStudentAccess } from "@/lib/student-first-access-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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
        const outcome = await notifyStudentAccess(supabase, input);
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
    console.error("Erro ao registrar webhook da Hotmart:", error);
    return NextResponse.json({ success: false }, { status: 500 });
  }
}
