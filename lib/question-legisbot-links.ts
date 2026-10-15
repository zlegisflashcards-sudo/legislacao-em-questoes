import "server-only";

import { obterAdministrador } from "@/lib/admin-auth";
import { getSupabaseServerClient } from "@/lib/supabase-server";
import { legisBotOrderCandidates } from "@/lib/legisbot/source";

export type QuestionLegisBotStatus = "vinculado" | "hierarquia" | "sem_legisbot";

export type QuestionLegisBotResolution = {
  questionId: string;
  status: QuestionLegisBotStatus;
  legisbotId: number | null;
  ordem: string | null;
  source: "manual" | "hierarchy" | null;
};

type QuestionIdentifier = { id: string; slug: string; ordem: string };
type BotRow = { id: number; slug: string; ordem: string; status: string; comentario: string | null };

function available(row: BotRow) {
  return row.status === "concluido" && Boolean(row.comentario?.trim());
}

/** Resolve vínculo manual antes da cadeia estrutural oficial. Não consulta todas as questões. */
export async function resolveQuestionLegisBotLinks(questions: QuestionIdentifier[]): Promise<QuestionLegisBotResolution[]> {
  if (!questions.length) return [];
  const db = getSupabaseServerClient();
  const ids = questions.map((item) => item.id);
  const linksResult = await db.from("question_legisbot_links").select("question_id,legisbot_id").in("question_id", ids);
  if (linksResult.error) throw new Error("Não foi possível consultar os vínculos de LegisBot.");
  const linkedIds = [...new Set((linksResult.data ?? []).map((row) => Number(row.legisbot_id)).filter(Number.isSafeInteger))];
  const candidates = [...new Set(questions.flatMap((item) => legisBotOrderCandidates(item.ordem)))];
  const slugs = [...new Set(questions.map((item) => item.slug.toUpperCase()))];
  const [linkedBots, hierarchyBots] = await Promise.all([
    linkedIds.length ? db.from("legisbot_comentarios").select("id,slug,ordem,status,comentario").in("id", linkedIds) : Promise.resolve({ data: [], error: null }),
    db.from("legisbot_comentarios").select("id,slug,ordem,status,comentario").in("slug", slugs).in("ordem", candidates),
  ]);
  if (linkedBots.error || hierarchyBots.error) throw new Error("Não foi possível consultar os conteúdos do LegisBot.");
  const linkedById = new Map((linkedBots.data ?? []).map((row) => [Number(row.id), row as BotRow]));
  const linkByQuestion = new Map((linksResult.data ?? []).map((row) => [String(row.question_id), Number(row.legisbot_id)]));
  const hierarchy = new Map((hierarchyBots.data ?? []).map((row) => [`${String(row.slug).toUpperCase()}\u0000${String(row.ordem)}`, row as BotRow]));
  return questions.map((question) => {
    const manual = linkedById.get(linkByQuestion.get(question.id) ?? -1);
    if (manual && available(manual)) return { questionId: question.id, status: "vinculado", legisbotId: manual.id, ordem: manual.ordem, source: "manual" };
    for (const ordem of legisBotOrderCandidates(question.ordem)) {
      const bot = hierarchy.get(`${question.slug.toUpperCase()}\u0000${ordem}`);
      if (bot && available(bot)) return { questionId: question.id, status: "hierarquia", legisbotId: bot.id, ordem: bot.ordem, source: "hierarchy" };
    }
    return { questionId: question.id, status: "sem_legisbot", legisbotId: null, ordem: null, source: null };
  });
}

export async function searchLegisBotsForQuestionLink(input: { slug: string; query?: string; page?: number; pageSize?: number }) {
  const user = await obterAdministrador();
  if (!user) throw new Error("Autenticação administrativa obrigatória.");
  const slug = input.slug.trim().toUpperCase();
  const query = (input.query ?? "").trim().slice(0, 120).replace(/[,%()]/g, " ");
  const pageSize = Math.min(50, Math.max(1, Number(input.pageSize) || 20));
  const page = Math.max(1, Number(input.page) || 1);
  let request = getSupabaseServerClient().from("legisbot_comentarios").select("id,slug,ordem,titulo,assunto,status,comentario", { count: "exact" }).eq("slug", slug).order("ordem").range((page - 1) * pageSize, page * pageSize - 1);
  if (query) { const value = `%${query}%`; request = request.or(`ordem.ilike.${value},titulo.ilike.${value},assunto.ilike.${value}`); }
  const result = await request;
  if (result.error) throw new Error("Não foi possível pesquisar os LegisBots desta lei.");
  return { records: result.data ?? [], page, pageSize, total: result.count ?? 0, hasNextPage: (result.count ?? 0) > page * pageSize };
}

export async function setQuestionLegisBotLink(input: { questionIds: string[]; legisbotId: number | null }) {
  const user = await obterAdministrador();
  if (!user) throw new Error("Autenticação administrativa obrigatória.");
  const ids = [...new Set(input.questionIds.filter((id) => /^[0-9a-f-]{36}$/i.test(id)))];
  if (!ids.length || ids.length > 100) throw new Error("Selecione de 1 a 100 questões.");
  const db = getSupabaseServerClient();
  if (input.legisbotId === null) {
    const deleted = await db.from("question_legisbot_links").delete().in("question_id", ids);
    if (deleted.error) throw new Error("Não foi possível remover os vínculos do LegisBot.");
    return { linked: 0, unlinked: ids.length };
  }
  if (!Number.isSafeInteger(input.legisbotId) || input.legisbotId < 1) throw new Error("LegisBot inválido.");
  const saved = await db.from("question_legisbot_links").upsert(ids.map((questionId) => ({ question_id: questionId, legisbot_id: input.legisbotId, linked_by: user.id })), { onConflict: "question_id" });
  if (saved.error) throw new Error(saved.error.code === "23514" ? "O LegisBot selecionado pertence a outra legislação." : "Não foi possível salvar os vínculos do LegisBot.");
  return { linked: ids.length, unlinked: 0 };
}
