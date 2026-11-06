import { doctrineReadPayload, doctrineTopicOrder, resolveDoctrineTopicLink } from "@/lib/doctrine-read-contract";
import { authorizeDoctrineStudy } from "@/lib/doctrine-study-access";
import { LawStudyApiError, lawStudyErrorResponse } from "@/lib/law-study-server";
import { mainDoctrineBySlug, mainQuestions } from "@/lib/questions-main-server";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ slug: string }> };

export async function GET(request: Request, context: RouteContext) {
  try {
    const { slug } = await context.params;
    await authorizeDoctrineStudy(request, slug);
    const doctrine = await mainDoctrineBySlug(slug);
    if (!doctrine) throw new LawStudyApiError(404, "Disciplina não encontrada ou não liberada para sua conta.");
    const params = new URL(request.url).searchParams;
    const order = doctrineTopicOrder(params.get("ordem"));
    if (order === undefined) throw new LawStudyApiError(400, "Ordem de tópico inválida.");
    const allQuestions = await mainQuestions(doctrine.id);
    const resolvedOrder = resolveDoctrineTopicLink(allQuestions, params.get("questao"), order);
    const questions = resolvedOrder ? allQuestions.filter((question) => question.ordem === resolvedOrder) : order === null ? allQuestions : [];
    return Response.json({ ...doctrineReadPayload(doctrine, questions, resolvedOrder), fallbackToBase: order !== null && resolvedOrder === null }, { headers: { "Cache-Control": "private, no-store, max-age=0" } });
  } catch (error) {
    return lawStudyErrorResponse(error);
  }
}
