import "server-only";

import { authorizeLawStudy, LawStudyApiError } from "@/lib/law-study-server";
import { effectiveCampaignScore, personalRecordForAttempt } from "@/lib/law-campaign-personal-record";
import { buildCampaignSnapshot } from "@/lib/law-campaign-snapshot";
import { mainQuestionById, mainQuestions, mainQuestionsByIds, mainStructure } from "@/lib/questions-main-server";

type Question = { id: string; pergunta: string; resposta: string; justificativa: string | null; assunto: string | null; legislacao: string | null; ordem: string; titulo: string | null; capitulo: string | null; secao: string | null; subsecao: string | null; artigo: string | null; ultima_alteracao_legislativa: string | null; structure_id: number | null };
type Level = { id: number; ordem: number; chave_origem?: string; nome: string; questoes_ids: string[]; proxima_posicao: number; pendencias_ids: string[]; total_erros: number; concluido: boolean };
const cacheHeaders = { "Cache-Control": "private, no-store, max-age=0" };

function arrayOfStrings(value: unknown): string[] { return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : []; }
function score(errors: number) { return Math.max(0, 10000 - errors * 100); }
function normalizedAnswer(value: string) { const normalized = value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase(); return ["certo", "certa", "correto", "correta"].includes(normalized) ? "certo" : ["errado", "errada", "incorreto", "incorreta"].includes(normalized) ? "errado" : null; }

async function loadQuestionSnapshot(lawId: number, title: string) {
  let questions: Question[]; let structures: Array<{ id: number; parent_id: number | null; nome: string }>;
  try { [questions, structures] = await Promise.all([mainQuestions(lawId), mainStructure(lawId)]); } catch { throw new LawStudyApiError(503, "Não foi possível carregar as questões agora."); }
  if (!questions.length) throw new LawStudyApiError(404, "Esta lei ainda não possui questões disponíveis.");
  return buildCampaignSnapshot(title, questions, structures);
}

type StudyContext = Awaited<ReturnType<typeof authorizeLawStudy>>;

async function getCampaignFor(context: StudyContext) {
  const { supabase, lawId, studentId } = context;
  const { data: progress, error } = await supabase.from("progresso_leis_alunos").select("status_campanha,campanha_ativa_id").eq("aluno_id", studentId).eq("lei_id", lawId).maybeSingle();
  if (error) throw new LawStudyApiError(503, "Não foi possível carregar seu Estudo Ativo da Lei.");
  return { status: progress?.status_campanha ?? "nao_iniciada", campaignId: progress?.campanha_ativa_id ?? null };
}

export async function getCampaign(request: Request, slug: string) {
  return getCampaignFor(await authorizeLawStudy(request, slug));
}

export async function startCampaign(request: Request, slug: string) {
  const context = await authorizeLawStudy(request, slug);
  const { supabase, lawId, studentId } = context;
  const current = await getCampaignFor(context);
  if (current.status === "concluida") return campaignStateFor(context);
  if (!current.campaignId) {
    const snapshot = await loadQuestionSnapshot(lawId, context.title);
    let created = true;
    let { data: campaign, error } = await supabase.from("campanhas_leis_alunos").insert({ aluno_id: studentId, lei_id: lawId }).select("id").single();
    if (error?.code === "23505") {
      created = false;
      const existing = await supabase.from("campanhas_leis_alunos").select("id").eq("aluno_id", studentId).eq("lei_id", lawId).eq("concluida", false).maybeSingle();
      campaign = existing.data;
      error = existing.error;
    }
    if (error || !campaign) throw new LawStudyApiError(503, "Não foi possível iniciar seu Estudo Ativo da Lei.");
    if (created) {
      const { error: levelsError } = await supabase.from("campanhas_leis_niveis").insert(snapshot.levels.map((level, ordem) => ({ campanha_id: campaign.id, ordem, chave_origem: level.chave, nome: level.nome, questoes_ids: level.ids })));
      if (levelsError) throw new LawStudyApiError(503, "Não foi possível preparar seu Estudo Ativo da Lei.");
    }
    const { error: progressError } = await supabase.from("progresso_leis_alunos").upsert({ aluno_id: studentId, lei_id: lawId, em_estudo: true, questoes_finalizadas: false, status_campanha: "em_andamento", campanha_ativa_id: campaign.id }, { onConflict: "aluno_id,lei_id" });
    if (progressError) throw new LawStudyApiError(503, "Não foi possível iniciar seu Estudo Ativo da Lei.");
    return campaignStateFor(context);
  }
  return campaignStateFor(context);
}

async function campaignStateFor(context: StudyContext) {
  const { supabase, lawId, studentId } = context;
  const state = await getCampaignFor(context);
  let bestScore: number | null = null;
  let result: { score: number; bestScore: number; errors: number; totalQuestions: number; position?: number; personalRecord: ReturnType<typeof personalRecordForAttempt> } | null = null;
  if (state.status === "concluida") {
    const [history, latest, ranking] = await Promise.all([
      supabase.from("campanhas_leis_alunos").select("id,score,score_ajustado").eq("aluno_id", studentId).eq("lei_id", lawId).eq("concluida", true),
      supabase.from("campanhas_leis_alunos").select("id,score,score_ajustado,total_erros").eq("aluno_id", studentId).eq("lei_id", lawId).eq("concluida", true).order("concluida_em", { ascending: false }).limit(1).maybeSingle(),
      supabase.rpc("obter_resultado_campanha_lei", { p_aluno_id: studentId, p_lei_id: lawId }),
    ]);
    if (history.error || latest.error || ranking.error) throw new LawStudyApiError(503, "Não foi possível carregar seu Estudo Ativo da Lei.");
    bestScore = (history.data ?? []).map(effectiveCampaignScore).filter((value): value is number => typeof value === "number").reduce<number | null>((best, value) => best === null || value > best ? value : best, null);
    const rankingRow = Array.isArray(ranking.data) ? ranking.data[0] : null;
    const position = Number(rankingRow?.posicao);
    const rankingPosition = Number.isSafeInteger(position) && position > 0 ? position : null;
    const latestCampaign = latest.data;
    const latestScore = typeof latestCampaign?.score_ajustado === "number" ? latestCampaign.score_ajustado : latestCampaign?.score;
    if (latestCampaign && typeof latestScore === "number" && typeof latestCampaign.total_erros === "number") {
      const { data: levels, error: levelsError } = await supabase.from("campanhas_leis_niveis").select("questoes_ids").eq("campanha_id", latestCampaign.id);
      if (levelsError) throw new LawStudyApiError(503, "Não foi possível carregar seu Estudo Ativo da Lei.");
      const previousCampaigns = (history.data ?? []).filter((campaign) => campaign.id !== latestCampaign.id);
      result = { score: latestScore, bestScore: bestScore ?? latestScore, errors: latestCampaign.total_erros, totalQuestions: (levels ?? []).flatMap((level) => arrayOfStrings(level.questoes_ids)).length, position: rankingPosition ?? undefined, personalRecord: personalRecordForAttempt(latestScore, previousCampaigns) };
    }
  }
  if (!state.campaignId) return { ...state, bestScore, result, level: null, question: null, progress: state.status === "concluida" ? 100 : 0 };
  const { data: levels, error } = await supabase.from("campanhas_leis_niveis").select("id,ordem,chave_origem,nome,questoes_ids,proxima_posicao,pendencias_ids,total_erros,concluido").eq("campanha_id", state.campaignId).order("ordem");
  if (error) throw new LawStudyApiError(503, "Não foi possível carregar seu Estudo Ativo da Lei.");
  const parsed = (levels ?? []).map((level) => ({ ...level, questoes_ids: arrayOfStrings(level.questoes_ids), pendencias_ids: arrayOfStrings(level.pendencias_ids) })) as Level[];
  const level = parsed.find((item) => !item.concluido) ?? null;
  const all = parsed.flatMap((item) => item.questoes_ids); const completed = parsed.filter((item) => item.concluido).flatMap((item) => item.questoes_ids).length;
  const levelSummary = parsed.map((item) => ({ id: item.id, chave: item.chave_origem ?? "", nome: item.nome, concluido: item.concluido, posicao: item.proxima_posicao, totalQuestoes: item.questoes_ids.length, revisando: item.proxima_posicao >= item.questoes_ids.length && item.pendencias_ids.length > 0 }));
  if (!level) return { ...state, bestScore, level: null, levels: levelSummary, question: null, progress: all.length ? Math.round(completed / all.length * 100) : 100 };
  const questionId = level.proxima_posicao < level.questoes_ids.length ? level.questoes_ids[level.proxima_posicao] : level.pendencias_ids[0];
  const questions = await mainQuestionsByIds(lawId, level.questoes_ids);
  let question = questionId ? questions.find((item) => item.id === questionId) ?? null : null;
  // O snapshot da campanha é a autoridade para a ordem. Se a consulta em lote
  // não devolver justamente a questão atual, confirme-a pelo seu ID na mesma
  // fonte principal; não deixe uma campanha válida parecer vazia no player.
  if (!question && questionId) {
    const recoveredQuestion = await mainQuestionById(lawId, questionId);
    question = recoveredQuestion;
    if (recoveredQuestion && !questions.some((item) => item.id === recoveredQuestion.id)) questions.push(recoveredQuestion);
  }
  const questionsById = new Map(questions.map((item) => [item.id, item]));
  const orderedQuestions = level.questoes_ids.flatMap((id) => questionsById.get(id) ? [questionsById.get(id)!] : []);
  const reviewing = level.proxima_posicao >= level.questoes_ids.length;
  const firstPassProgress = level.questoes_ids.length ? Math.round(Math.min(level.proxima_posicao, level.questoes_ids.length) / level.questoes_ids.length * 100) : 0;
  const activeDone = reviewing ? level.questoes_ids.length : Math.min(level.proxima_posicao, level.questoes_ids.length);
  return { ...state, bestScore, level: { id: level.id, nome: level.nome, concluded: false, position: level.proxima_posicao, firstPassProgress, reviewing, questions: orderedQuestions }, levels: levelSummary, question, progress: all.length ? Math.round((completed + activeDone) / all.length * 100) : 0 };
}

export async function campaignState(request: Request, slug: string) {
  return campaignStateFor(await authorizeLawStudy(request, slug));
}

export async function answerCampaign(request: Request, slug: string, value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new LawStudyApiError(400, "Resposta inválida.");
  const body = value as Record<string, unknown>; const questionId = typeof body.questionId === "string" ? body.questionId : null; const selectedAnswer = body.answer === "certo" || body.answer === "errado" ? body.answer : null;
  if (!questionId || !selectedAnswer) throw new LawStudyApiError(400, "Resposta inválida.");
  const context = await authorizeLawStudy(request, slug); const { supabase } = context; const state = await getCampaignFor(context);
  if (state.status !== "em_andamento" || !state.campaignId) throw new LawStudyApiError(409, "Não há Estudo Ativo da Lei em andamento para responder.");
  const { data: rawLevels, error } = await supabase.from("campanhas_leis_niveis").select("id,ordem,nome,questoes_ids,proxima_posicao,pendencias_ids,total_erros,concluido").eq("campanha_id", state.campaignId).order("ordem");
  if (error) throw new LawStudyApiError(503, "Não foi possível salvar sua resposta.");
  const levels = (rawLevels ?? []).map((level) => ({ ...level, questoes_ids: arrayOfStrings(level.questoes_ids), pendencias_ids: arrayOfStrings(level.pendencias_ids) })) as Level[];
  const level = levels.find((item) => !item.concluido); if (!level) throw new LawStudyApiError(409, "Este Estudo Ativo da Lei já foi concluído.");
  const expected = level.proxima_posicao < level.questoes_ids.length ? level.questoes_ids[level.proxima_posicao] : level.pendencias_ids[0];
  if (expected !== questionId) throw new LawStudyApiError(409, "A questão atual foi atualizada. Recarregue a página.");
  const snapshotQuestion = await mainQuestionById(context.lawId, questionId);
  const answer = snapshotQuestion ? normalizedAnswer(snapshotQuestion.resposta) : null;
  if (!answer) throw new LawStudyApiError(409, "Esta questão não possui um gabarito válido para o Estudo Ativo da Lei.");
  const correct = selectedAnswer === answer;
  const nextPosition = level.proxima_posicao < level.questoes_ids.length ? level.proxima_posicao + 1 : level.proxima_posicao;
  const nextPending = level.proxima_posicao < level.questoes_ids.length ? [...level.pendencias_ids, ...(correct ? [] : [questionId])] : correct ? level.pendencias_ids.slice(1) : [...level.pendencias_ids.slice(1), questionId];
  const concludesLevel = nextPosition >= level.questoes_ids.length && nextPending.length === 0;
  const levelErrors = level.total_erros + (correct ? 0 : 1);
  const { data: updatedLevel, error: updateError } = await supabase.from("campanhas_leis_niveis").update({ proxima_posicao: nextPosition, pendencias_ids: nextPending, total_erros: levelErrors, concluido: concludesLevel }).eq("id", level.id).eq("concluido", false).select("id");
  if (updateError) throw new LawStudyApiError(503, "Não foi possível salvar sua resposta.");
  if (!updatedLevel?.length) throw new LawStudyApiError(409, "A questão atual foi atualizada. Recarregue a página.");
  if (!correct) { const { error: errorsError } = await supabase.rpc("increment_campaign_errors", { campaign_id: state.campaignId }); if (errorsError) throw new LawStudyApiError(503, "Não foi possível salvar sua resposta."); }
  const isFinal = concludesLevel && levels.every((item) => item.id === level.id || item.concluido);
  let result: { score: number; bestScore: number; position: number; participants: number; errors: number; totalQuestions: number; personalRecord: ReturnType<typeof personalRecordForAttempt> } | null = null;
  if (isFinal) {
    const context = await authorizeLawStudy(request, slug);
    const { data: previousCampaigns, error: previousError } = await supabase.from("campanhas_leis_alunos").select("score,score_ajustado").eq("aluno_id", context.studentId).eq("lei_id", context.lawId).eq("concluida", true);
    if (previousError) throw new LawStudyApiError(503, "Não foi possível concluir seu Estudo Ativo da Lei.");
    const { data: campaign, error: campaignError } = await supabase.from("campanhas_leis_alunos").select("total_erros").eq("id", state.campaignId).single();
    if (campaignError || !campaign) throw new LawStudyApiError(503, "Não foi possível concluir seu Estudo Ativo da Lei.");
    const finalScore = score(campaign.total_erros);
    const { data: finishedCampaign, error: finishError } = await supabase.from("campanhas_leis_alunos").update({ concluida: true, concluida_em: new Date().toISOString(), score: finalScore }).eq("id", state.campaignId).eq("concluida", false).select("id");
    if (finishError) throw new LawStudyApiError(503, "Não foi possível concluir seu Estudo Ativo da Lei.");
    if (!finishedCampaign?.length) throw new LawStudyApiError(409, "Este Estudo Ativo da Lei já foi concluído.");
    const { error: progressError } = await supabase.from("progresso_leis_alunos").update({ status_campanha: "concluida", questoes_finalizadas: true, campanha_ativa_id: null }).eq("campanha_ativa_id", state.campaignId);
    if (progressError) throw new LawStudyApiError(503, "Não foi possível concluir seu Estudo Ativo da Lei.");
    const { data: ranking, error: rankingError } = await supabase.rpc("obter_resultado_campanha_lei", { p_aluno_id: context.studentId, p_lei_id: context.lawId });
    const row = Array.isArray(ranking) ? ranking[0] : null;
    if (rankingError || !row) throw new LawStudyApiError(503, "Não foi possível calcular seu resultado.");
    result = { score: row.score_atual, bestScore: row.melhor_score, position: Number(row.posicao), participants: Number(row.participantes), errors: campaign.total_erros, totalQuestions: levels.flatMap((item) => item.questoes_ids).length, personalRecord: personalRecordForAttempt(finalScore, previousCampaigns ?? []) };
  }
  const totalQuestions = levels.flatMap((item) => item.questoes_ids).length;
  const completedBeforeCurrentLevel = levels.filter((item) => item.id !== level.id && item.concluido).flatMap((item) => item.questoes_ids).length;
  const currentLevelFirstPassCompleted = Math.min(nextPosition, level.questoes_ids.length);
  const globalCompletedQuestions = completedBeforeCurrentLevel + currentLevelFirstPassCompleted;
  const nextQuestionId = !isFinal && !concludesLevel ? nextPosition < level.questoes_ids.length ? level.questoes_ids[nextPosition] : nextPending[0] ?? null : null;
  return { levelConcluded: concludesLevel, campaignConcluded: isFinal, progress: totalQuestions ? Math.round(globalCompletedQuestions / totalQuestions * 100) : 100, next: nextQuestionId ? { questionId: nextQuestionId, position: nextPosition, reviewing: nextPosition >= level.questoes_ids.length && nextPending.length > 0 } : null, levelResult: concludesLevel ? { errors: levelErrors } : null, result };
}

/** Backend preparado para o futuro botão de reset; preserva o histórico concluído. */
export async function resetCampaign(request: Request, slug: string) {
  const { supabase, lawId, studentId } = await authorizeLawStudy(request, slug);
  const { data: current, error: currentError } = await supabase.from("progresso_leis_alunos").select("campanha_ativa_id").eq("aluno_id", studentId).eq("lei_id", lawId).maybeSingle();
  if (currentError) throw new LawStudyApiError(503, "Não foi possível resetar seu Estudo Ativo da Lei.");
  if (typeof current?.campanha_ativa_id === "string") {
    const { error: deleteError } = await supabase.from("campanhas_leis_alunos").delete().eq("id", current.campanha_ativa_id).eq("concluida", false);
    if (deleteError) throw new LawStudyApiError(503, "Não foi possível resetar seu Estudo Ativo da Lei.");
  }
  const { error } = await supabase.from("progresso_leis_alunos").upsert({ aluno_id: studentId, lei_id: lawId, em_estudo: false, questoes_finalizadas: false, status_campanha: "nao_iniciada", campanha_ativa_id: null }, { onConflict: "aluno_id,lei_id" });
  if (error) throw new LawStudyApiError(503, "Não foi possível resetar seu Estudo Ativo da Lei.");
  return { status: "nao_iniciada" };
}

export { cacheHeaders };
