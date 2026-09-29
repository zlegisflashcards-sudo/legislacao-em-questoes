import "server-only";
import { authenticateLawStudent, LawStudyApiError } from "@/lib/law-study-server";
import { listLawStudyContexts } from "@/lib/law-question-scope-access";

export async function authorizeLawQuestionScope(request: Request, slug: string, recorteId: string | null) {
  const context = await authenticateLawStudent(request, slug);
  const contexts = await listLawStudyContexts(context.studentId, context.lawId);
  if (!recorteId) {
    if (!contexts.some((item) => item.recorteId === null)) throw new LawStudyApiError(403, "A lei completa não está liberada para sua conta.");
    return { ...context, recorte: null as null, structureIds: null as number[] | null };
  }
  if (!/^[0-9a-f-]{36}$/i.test(recorteId)) throw new LawStudyApiError(400, "Recorte de lei inválido.");
  const scope = contexts.find((item) => item.recorteId === recorteId);
  if (!scope) throw new LawStudyApiError(403, "Este recorte não está liberado para sua conta.");
  return { ...context, recorte: { id: recorteId, nome: scope.nome }, structureIds: scope.structureIds, questionIds: scope.questionIds ?? [] };
}

/** Lista os contextos disponíveis sem pressupor que a lei completa foi liberada. */
export async function authorizeLawStudyContexts(request: Request, slug: string) {
  const context = await authenticateLawStudent(request, slug);
  const contexts = await listLawStudyContexts(context.studentId, context.lawId);
  if (!contexts.length) throw new LawStudyApiError(404, "Lei não encontrada ou não liberada para sua conta.");
  return { ...context, contexts };
}
