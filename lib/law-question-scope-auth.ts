import "server-only";
import { authorizeLawStudy, LawStudyApiError } from "@/lib/law-study-server";
import { listLawStudyContexts } from "@/lib/law-question-scope-access";
import { mainQuestions } from "@/lib/questions-main-server";

export async function listAuthorizedLawStudyContexts(context: Awaited<ReturnType<typeof authorizeLawStudy>>) {
  if (context.studentId) return listLawStudyContexts(context.studentId, context.lawId);
  const questions = await mainQuestions(context.lawId);
  return [{ recorteId: null, nome: "Lei completa", questionCount: questions.length, structureIds: null, questionIds: questions.map((question) => question.id) }];
}

export async function authorizeLawQuestionScope(request: Request, slug: string, recorteId: string | null) {
  const context = await authorizeLawStudy(request, slug);
  const contexts = await listAuthorizedLawStudyContexts(context);
  if (!recorteId) {
    if (!contexts.some((item) => item.recorteId === null)) throw new LawStudyApiError(403, "A lei completa não está liberada para sua conta.");
    return { ...context, recorte: null as null };
  }
  if (!/^[0-9a-f-]{36}$/i.test(recorteId)) throw new LawStudyApiError(400, "Recorte de lei inválido.");
  if (context.accessKind === "admin") {
    const { data, error } = await context.supabase.from("recortes_leis").select("id,nome").eq("id", recorteId).eq("lei_id", context.lawId).eq("ativo", true).maybeSingle();
    if (error) throw new LawStudyApiError(500, "Não foi possível verificar este recorte agora.");
    if (!data) throw new LawStudyApiError(404, "Recorte de lei não encontrado.");
    return { ...context, recorte: { id: data.id, nome: data.nome } };
  }
  const scope = contexts.find((item) => item.recorteId === recorteId);
  if (!scope) throw new LawStudyApiError(403, "Este recorte não está liberado para sua conta.");
  return { ...context, recorte: { id: recorteId, nome: scope.nome } };
}
