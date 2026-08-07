import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase-server";
import { registrarEventoHotmart, validarHottok } from "@/lib/hotmart/webhook";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (!validarHottok(request.headers.get("x-hotmart-hottok"), process.env.HOTMART_HOTTOK)) {
    return NextResponse.json({ success: false }, { status: 401 });
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ success: false, error: "Payload inválido." }, { status: 400 });
  }

  try {
    const result = await registrarEventoHotmart(getSupabaseServerClient(), payload);
    return NextResponse.json({ success: true, duplicate: result.duplicate });
  } catch (error) {
    if (error instanceof Error && /payload inválido|sem identificador/i.test(error.message)) {
      return NextResponse.json({ success: false, error: "Payload inválido." }, { status: 400 });
    }
    console.error("Erro ao registrar webhook da Hotmart:", error);
    return NextResponse.json({ success: false }, { status: 500 });
  }
}
