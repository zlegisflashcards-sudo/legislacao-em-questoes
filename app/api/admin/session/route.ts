import { NextResponse } from "next/server";
import { obterAdministrador } from "@/lib/admin-auth";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const administrador = await obterAdministrador();
    return NextResponse.json(
      { authenticated: Boolean(administrador) },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return NextResponse.json(
      { authenticated: false },
      { headers: { "Cache-Control": "no-store" } },
    );
  }
}
