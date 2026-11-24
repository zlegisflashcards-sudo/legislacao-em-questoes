import { NextRequest, NextResponse } from "next/server";
import { obterAdministrador } from "@/lib/admin-auth";
import { getContinuousReadingBlockTextsForLaw, getContinuousReadingStructureReadiness, getScopedContinuousReadingBlockTexts } from "@/lib/legisbot/continuous-reading-server";
import { lawStudyErrorResponse } from "@/lib/law-study-server";
import { loadScopedInteractiveReading } from "@/lib/legisbot/scoped-interactive-reading-server";
import { authorizeIntegralInteractiveReading } from "@/lib/legisbot/interactive-reading-access";

export const dynamic = "force-dynamic";
const MAXIMUM_BLOCKS = 60;

export async function GET(request: NextRequest, context: { params: Promise<{ slug: string }> }) {
  const { slug } = await context.params;
  const referenceIds = (request.nextUrl.searchParams.get("reference_ids") ?? "").split(",").slice(0, MAXIMUM_BLOCKS);
  const structureId = request.nextUrl.searchParams.get("structure_id");
  const studyUnitId = request.nextUrl.searchParams.get("study_unit_id");
  if (!referenceIds.length || !referenceIds.some(Boolean)) return NextResponse.json({ error: "Selecione os blocos da leitura." }, { status: 400 });
  try {
    if (request.nextUrl.searchParams.has("recorte_id")) {
      const headers = { "Cache-Control": "private, no-store, max-age=0" };
      const model = await loadScopedInteractiveReading(request, slug, request.nextUrl.searchParams);
      if (!model) return NextResponse.json({ message: "Lei Interativa do recorte em preparação." }, { status: 409, headers });
      return NextResponse.json({ blocks: await getScopedContinuousReadingBlockTexts(model, referenceIds) ?? [] }, { headers });
    }
    // A simulação administrativa não é uma liberação comercial. Fora dela,
    // todo lote de HTML exige a mesma autorização da Lei e do LegisCast.
    const administrator = await obterAdministrador();
    if (!administrator) await authorizeIntegralInteractiveReading(request, slug);
    // A paginação reconsulta a mesma trava do catálogo; parâmetros de UUID,
    // estrutura ou unidade não podem reabrir conteúdo em preparação.
    if (!administrator) {
      const structureReadiness = await getContinuousReadingStructureReadiness(slug);
      if (!structureReadiness) return NextResponse.json({ error: "Legislação não encontrada." }, { status: 404 });
      if (!structureReadiness.ready) return NextResponse.json({ error: "Lei Interativa em preparação." }, { status: 409 });
    }
    const blocks = await getContinuousReadingBlockTextsForLaw(slug, referenceIds, structureId, studyUnitId);
    if (blocks === null) return NextResponse.json({ error: "Legislação não encontrada." }, { status: 404 });
    return NextResponse.json({ blocks }, { headers: { "Cache-Control": "private, no-store, max-age=0" } });
  } catch (error) {
    const authorizedError = lawStudyErrorResponse(error);
    if (authorizedError.status !== 500) return authorizedError;
    console.error("[LegisBot] Falha ao carregar página progressiva da legislação.", { slug, tipo: error instanceof Error ? error.name : "unknown" });
    return NextResponse.json({ error: "Não foi possível carregar esta parte da legislação." }, { status: 503 });
  }
}
