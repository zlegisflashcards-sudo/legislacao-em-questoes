import { NextRequest, NextResponse } from "next/server";
import { continuousBlockAnchor, isContinuousQuestionId } from "@/lib/legisbot/continuous-reading-core";
import { getContinuousReadingBlocks, getContinuousReadingModel, resolveContinuousQuestionReferenceFromModel, resolveContinuousReferenceFromModel } from "@/lib/legisbot/continuous-reading-server";
import { obterAdministrador } from "@/lib/admin-auth";
import { authorizeLawStudy, lawStudyErrorResponse } from "@/lib/law-study-server";

export const dynamic = "force-dynamic";

/**
 * A Lei Interativa é material de estudo da lei. O catálogo e o primeiro lote
 * só são entregues depois da mesma autorização comercial usada por Anki e
 * LegisCast; o navegador nunca recebe blocos antes dessa verificação.
 */
export async function GET(request: NextRequest, context: { params: Promise<{ slug: string }> }) {
  try {
    const { slug } = await context.params;
    // A simulação administrativa usa os mesmos componentes da leitura do
    // aluno. Um administrador autenticado pode conferi-la sem precisar de
    // uma liberação comercial pessoal; os demais continuam obrigatoriamente
    // sujeitos à autorização da lei.
    if (!await obterAdministrador()) await authorizeLawStudy(request, slug);
    const model = await getContinuousReadingModel(slug);
    if (!model) return NextResponse.json({ message: "Lei não encontrada ou indisponível para sua conta." }, { status: 404 });

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
