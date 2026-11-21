import { NextRequest, NextResponse } from "next/server";
import { obterAdministrador } from "@/lib/admin-auth";
import { getAdministrativeContinuousReadingBlockTexts } from "@/lib/legisbot/continuous-reading-server";

export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store, max-age=0" };

export async function GET(request: NextRequest, context: { params: Promise<{ slug: string }> }) {
  if (!await obterAdministrador()) return NextResponse.json({ error: "Não autorizado." }, { status: 401, headers });
  const { slug } = await context.params;
  const rawStructure = request.nextUrl.searchParams.get("structure_id") ?? "";
  const structureId = /^\d+$/.test(rawStructure) ? Number(rawStructure) : NaN;
  if (!Number.isSafeInteger(structureId) || structureId <= 0) return NextResponse.json({ error: "Estrutura inválida." }, { status: 400, headers });
  const ids = (request.nextUrl.searchParams.get("reference_ids") ?? "").split(",").slice(0, 60);
  const blocks = await getAdministrativeContinuousReadingBlockTexts(slug, structureId, ids);
  if (blocks === null) return NextResponse.json({ error: "Legislação ou estrutura não encontrada." }, { status: 404, headers });
  return NextResponse.json({ blocks }, { headers });
}
