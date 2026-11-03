import { NextResponse } from "next/server";
import { obterAdministrador } from "@/lib/admin-auth";
import { createManualLegislativeReference, previewManualLegislativeReference } from "@/lib/admin-legislative-references";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "no-store, max-age=0" };

export async function POST(request: Request) {
  try {
    if (!await obterAdministrador()) return NextResponse.json({ error: "Autenticação administrativa obrigatória." }, { status: 401, headers });
    const body = await request.json() as Record<string, unknown>;
    const input = {
      lawSlug: body.law,
      legislation: body.legislation,
      identification: body.identification,
      ordem: body.ordem,
    };
    if (body.action === "preview") return NextResponse.json(await previewManualLegislativeReference(input), { headers });
    if (body.action === "create") return NextResponse.json(await createManualLegislativeReference({ ...input, expected: body.expected }), { headers });
    return NextResponse.json({ error: "Ação de bloco legislativo inválida." }, { status: 400, headers });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Não foi possível salvar o bloco legislativo." }, { status: 400, headers });
  }
}
