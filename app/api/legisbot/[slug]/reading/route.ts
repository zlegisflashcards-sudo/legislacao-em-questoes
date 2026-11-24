import { NextRequest, NextResponse } from "next/server";
import { continuousBlockAnchor, isContinuousQuestionId } from "@/lib/legisbot/continuous-reading-core";
import { getContinuousReadingBlocks, getContinuousReadingModel, resolveContinuousQuestionReferenceFromModel, resolveContinuousReferenceFromModel } from "@/lib/legisbot/continuous-reading-server";
import { obterAdministrador } from "@/lib/admin-auth";
import { lawStudyErrorResponse } from "@/lib/law-study-server";
import { loadScopedInteractiveReading } from "@/lib/legisbot/scoped-interactive-reading-server";
import { authorizeIntegralInteractiveReading } from "@/lib/legisbot/interactive-reading-access";

export const dynamic = "force-dynamic";

/**
 * A Lei Interativa é material de estudo da lei. O catálogo e o primeiro lote
 * só são entregues depois da mesma autorização comercial usada por Anki e
 * LegisCast; o navegador nunca recebe blocos antes dessa verificação.
 */
export async function GET(request: NextRequest, context: { params: Promise<{ slug: string }> }) {
  try {
    const { slug } = await context.params;
    if (request.nextUrl.searchParams.has("recorte_id")) {
      const headers = { "Cache-Control": "private, no-store, max-age=0" };
      const model = await loadScopedInteractiveReading(request, slug, request.nextUrl.searchParams);
      if (!model) return NextResponse.json({ preparation: "structure_pending", message: "Lei Interativa do recorte em preparação." }, { status: 409, headers });
      const { law, references, structures, publicAccess } = model;
      if (request.nextUrl.searchParams.get("availability") === "1") return NextResponse.json({ structureIds: publicAccess.accessibleStructureIds }, { headers });
      const rawOrder = request.nextUrl.searchParams.get("ordem");
      const reference = rawOrder ? references.find((item) => item.ordem === rawOrder) : null;
      if (reference) return NextResponse.json({ redirectTo: `/legisbot/${encodeURIComponent(law.slug)}#${continuousBlockAnchor(reference.id)}` }, { headers });
      const selected = request.nextUrl.searchParams.get("structure_id");
      const initialStructureId = selected && publicAccess.accessibleStructureIds.includes(Number(selected)) ? Number(selected) : publicAccess.firstAccessibleStructureId;
      const initialBlocks = await getContinuousReadingBlocks(model, 0, 30, initialStructureId);
      const visible = new Set(publicAccess.accessibleStructureIds);
      const project = <T extends typeof references[number]>(item: T): T => ({
        ...item, sourceQuestionId: null, structureCandidateIds: [],
        hierarchy: item.hierarchy.filter((node) => visible.has(node.id)),
      });
      // Retira todo o diagnóstico e os IDs das questões da resposta pública.
      return NextResponse.json({ model: { law, references: references.map(project), structures, publicAccess, integrity: { readingAvailable: true }, studyUnits: [] }, initialStructureId, initialBlocks: initialBlocks.map(project) }, { headers });
    }
    // A simulação administrativa usa os mesmos componentes da leitura do
    // aluno. Um administrador autenticado pode conferi-la sem precisar de
    // uma liberação comercial pessoal; os demais continuam obrigatoriamente
    // sujeitos à autorização da lei.
    const administrator = await obterAdministrador();
    if (!administrator) await authorizeIntegralInteractiveReading(request, slug);
    const model = await getContinuousReadingModel(slug);
    if (!model) return NextResponse.json({ message: "Lei não encontrada ou indisponível para sua conta." }, { status: 404 });

    // Não entregamos catálogo, âncoras nem o primeiro lote enquanto existir
    // bloco preparado sem destino estrutural seguro. A prévia administrativa
    // continua disponível para permitir a correção editorial.
    if (!administrator && !model.structureReadiness.ready) {
      return NextResponse.json({ preparation: "structure_pending", lawName: model.law.nome_curto || model.law.titulo }, { headers: { "Cache-Control": "private, no-store, max-age=0" } });
    }

    const questionId = request.nextUrl.searchParams.get("question_id") ?? "";
    const ordem = request.nextUrl.searchParams.get("ordem") ?? "";
    const reference = isContinuousQuestionId(questionId)
      ? resolveContinuousQuestionReferenceFromModel(model, questionId)
      : ordem ? resolveContinuousReferenceFromModel(model, ordem) : null;
    if (reference) return NextResponse.json({ redirectTo: `/legisbot/${encodeURIComponent(model.law.slug)}#${continuousBlockAnchor(reference.id)}` }, { headers: { "Cache-Control": "private, no-store, max-age=0" } });

    const initialStudyUnit = model.studyUnits[0] ?? null;
    const initialStructureId = model.publicAccess.mode === "partial"
      ? model.publicAccess.firstAccessibleStructureId
      : initialStudyUnit?.titleStructureId ?? null;
    const initialStudyUnitId = initialStructureId === null
      ? initialStudyUnit?.id ?? null
      : model.studyUnits.find((unit) => unit.structureIds.includes(initialStructureId))?.id ?? initialStudyUnit?.id ?? null;
    const initialBlocks = model.integrity.readingAvailable
      ? await getContinuousReadingBlocks(model, 0, 30, initialStructureId, initialStudyUnitId)
      : [];
    return NextResponse.json({ model, initialStructureId, initialStudyUnitId, initialBlocks }, { headers: { "Cache-Control": "private, no-store, max-age=0" } });
  } catch (error) {
    return lawStudyErrorResponse(error);
  }
}
