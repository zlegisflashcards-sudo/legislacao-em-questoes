import "server-only";

import { authorizeLawStudy, LawStudyApiError } from "@/lib/law-study-server";
import { mainQuestions } from "@/lib/questions-main-server";
import { pendingQuestionIds, reviewQuestionIds, type ReviewCampaignLevel } from "@/lib/law-review-rules";

export type ReviewKind = "errors" | "favorites" | "unanswered";

async function dataFor(request: Request, slug: string) {
  const context = await authorizeLawStudy(request, slug);
  const { supabase, studentId, lawId } = context;
  const [questions, { data: progress, error: progressError }, { data: favorites, error: favoritesError }, { data: campaigns, error: campaignsError }] = await Promise.all([
    mainQuestions(lawId),
    supabase.from("progresso_leis_alunos").select("campanha_ativa_id,status_campanha").eq("aluno_id", studentId).eq("lei_id", lawId).maybeSingle(),
    supabase.from("alunos_questoes_favoritas").select("questao_id").eq("aluno_id", studentId),
    supabase.from("campanhas_leis_alunos").select("id,concluida,created_at").eq("aluno_id", studentId).eq("lei_id", lawId).order("created_at", { ascending: false }),
  ]);
  if (progressError || favoritesError || campaignsError) throw new LawStudyApiError(503, "Não foi possível carregar suas revisões agora.");
  const campaignIds = (campaigns ?? []).flatMap((row) => typeof row.id === "string" ? [row.id] : []);
  const activeCampaignId = typeof progress?.campanha_ativa_id === "string" ? progress.campanha_ativa_id : null;
  const completedCampaignId = !activeCampaignId && progress?.status_campanha === "concluida" ? (campaigns ?? []).find((campaign) => campaign.concluida === true && typeof campaign.id === "string")?.id ?? null : null;
  const pendingCampaignId = activeCampaignId ?? completedCampaignId;
  const [history, current, levels] = await Promise.all([
    campaignIds.length ? supabase.from("campanhas_leis_respostas").select("questao_id").in("campanha_id", campaignIds) : Promise.resolve({ data: [], error: null }),
    activeCampaignId ? supabase.from("campanhas_leis_respostas").select("questao_id,correta").eq("campanha_id", activeCampaignId).eq("correta", false) : Promise.resolve({ data: [], error: null }),
    pendingCampaignId ? supabase.from("campanhas_leis_niveis").select("ordem,questoes_ids,concluido").eq("campanha_id", pendingCampaignId).order("ordem") : Promise.resolve({ data: [], error: null }),
  ]);
  if (history.error || current.error || levels.error) throw new LawStudyApiError(503, "Não foi possível carregar suas revisões agora.");
  const campaignLevels: ReviewCampaignLevel[] = (levels.data ?? []).map((level) => ({ ordem: Number(level.ordem), questoesIds: Array.isArray(level.questoes_ids) ? level.questoes_ids.filter((id): id is string => typeof id === "string") : [], concluido: level.concluido === true }));
  const pendingIds = pendingQuestionIds(campaignLevels, Boolean(completedCampaignId));
  const selection = reviewQuestionIds(questions.map((question) => question.id), (history.data ?? []).flatMap((row) => typeof row.questao_id === "string" ? [row.questao_id] : []), (current.data ?? []).flatMap((row) => typeof row.questao_id === "string" ? [row.questao_id] : []), (favorites ?? []).flatMap((row) => typeof row.questao_id === "string" ? [row.questao_id] : []), pendingIds);
  return { context, questions, favoriteIds: selection.favorites, errorIds: selection.errors, pendingIds: selection.unanswered };
}

export async function reviewState(request: Request, slug: string, kind?: ReviewKind) {
  const data = await dataFor(request, slug);
  const selected = kind === "errors" ? data.errorIds : kind === "favorites" ? data.favoriteIds : kind === "unanswered" ? data.pendingIds : null;
  return {
    counts: { errors: data.errorIds.size, favorites: data.favoriteIds.size, unanswered: data.pendingIds.size },
    favoriteIds: [...data.favoriteIds],
    questions: selected ? data.questions.filter((question) => selected.has(question.id)) : undefined,
  };
}

export async function toggleFavorite(request: Request, slug: string, value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value) || typeof (value as Record<string, unknown>).questionId !== "string") throw new LawStudyApiError(400, "Questão inválida.");
  const questionId = (value as Record<string, unknown>).questionId as string;
  const { context, questions, favoriteIds } = await dataFor(request, slug);
  if (!questions.some((question) => question.id === questionId)) throw new LawStudyApiError(404, "Questão não encontrada nesta lei.");
  const favorite = !favoriteIds.has(questionId);
  const result = favorite ? await context.supabase.from("alunos_questoes_favoritas").insert({ aluno_id: context.studentId, questao_id: questionId }) : await context.supabase.from("alunos_questoes_favoritas").delete().eq("aluno_id", context.studentId).eq("questao_id", questionId);
  if (result.error) throw new LawStudyApiError(503, "Não foi possível atualizar seus favoritos.");
  return { favorite, count: favorite ? favoriteIds.size + 1 : favoriteIds.size - 1 };
}
