import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase-server";
import {
  processarEventoHotmart,
  validarHottok,
  type HotmartPayload,
} from "@/lib/hotmart/webhook";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (!validarHottok(request.headers.get("x-hotmart-hottok"), process.env.HOTMART_HOTTOK)) {
    return NextResponse.json({ success: false }, { status: 401 });
  }

  let payload: HotmartPayload;
  try {
    payload = (await request.json()) as HotmartPayload;
  } catch {
    return NextResponse.json({ success: false, error: "Payload inválido." }, { status: 400 });
  }

  try {
    const result = await processarEventoHotmart(getSupabaseServerClient(), payload);
    return NextResponse.json({ success: true, duplicate: result.duplicate });
  } catch (error) {
    console.error("Erro ao processar webhook da Hotmart:", error);
    return NextResponse.json({ success: false }, { status: 500 });
  }
}
