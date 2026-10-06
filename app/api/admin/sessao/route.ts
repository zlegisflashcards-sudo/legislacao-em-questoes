import { NextResponse } from "next/server";
import { obterAdministrador } from "@/lib/admin-auth";

export const dynamic = "force-dynamic";

export async function GET() {
  const admin = await obterAdministrador();
  if (!admin) return NextResponse.json({ error: "Sessão administrativa expirada." }, { status: 401, headers: { "Cache-Control": "no-store" } });
  return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
}
