import { NextResponse } from "next/server";
import { activateStudentAccount, inspectStudentActivation } from "@/lib/student-activation-server";
import { getSupabaseServerClient } from "@/lib/supabase-server";

function tokenFrom(value: unknown) {
  return typeof value === "string" && value.length >= 32 && value.length <= 512 ? value : "";
}

export async function GET(request: Request) {
  const token = tokenFrom(new URL(request.url).searchParams.get("token"));
  const result = await inspectStudentActivation(getSupabaseServerClient(), token);
  return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  try {
    const body = await request.json() as { token?: unknown; password?: unknown };
    const token = tokenFrom(body.token);
    const password = typeof body.password === "string" ? body.password : "";
    if (!token || password.length < 8 || password.length > 256) return NextResponse.json({ state: "invalid" }, { status: 400 });
    const result = await activateStudentAccount(getSupabaseServerClient(), token, password);
    return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Nao foi possivel ativar a conta.";
    return NextResponse.json({ state: "error", message }, { status: 409, headers: { "Cache-Control": "no-store" } });
  }
}
