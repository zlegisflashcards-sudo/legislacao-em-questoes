import "server-only";

import { authorizeLawStudy, LawStudyApiError } from "@/lib/law-study-server";
import { bestCompletedCampaignForRecord, effectiveCampaignScore, personalRecordForAttempt } from "@/lib/law-campaign-personal-record";
import { campaignScore } from "@/lib/law-campaign-score";
import { buildCampaignSnapshot } from "@/lib/law-campaign-snapshot";
import { reconcileOpenCampaignLevels } from "@/lib/law-campaign-reconciliation";
import { mainQuestionById, mainQuestions, mainQuestionsByIds, mainStructure } from "@/lib/questions-main-server";

type Question = { id: string; pergunta: string; resposta: string; justificativa: string | null; assunto: string | null; legislacao: string | null; ordem: string; titulo: string | null; capitulo: string | null; secao: string | null; subsecao: string | null; artigo: string | null; ultima_alteracao_legislativa: string | null; structure_id: number | null };
type Level = { id: number; ordem: number; chave_origem?: string; nome: string; questoes_ids: string[]; proxima_posicao: number; pendencias_ids: string[]; total_erros: number; score_competitivo_acertos: number; score_competitivo_erros: number; concluido: boolean };
const cacheHeaders = { "Cache-Control": "private, no-store, max-age=0" };
const campaignReadTimeoutMs = 15_000;

class CampaignReadTimeoutError extends Error {
  constructor(readonly stage: string) {
    super(`Tempo limite ao carregar campanha na etapa ${stage}.`);
  }
}

function arrayOfStrings(value: unknown): string[] { return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : []; }
function normalizedAnswer(value: string) { const normalized = value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase(); return ["certo", "certa", "correto", "correta"].includes(normalized) ? "certo" : ["errado", "errada", "incorreto", "incorreta"].includes(normalized) ? "errado" : null; }

/**
 * Leituras de campanha não devem aguardar o timeout total da função serverless
 * caso uma dependência externa fique pendente. O log identifica a etapa sem
 * expor token, e-mail ou identificadores do aluno.
 */
async function campaignReadStep<T>(flow: "summary" | "player", slug: string, stage: string, operation: () => PromiseLike<T>) {
  const startedAt = Date.now();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new CampaignReadTimeoutError(stage)), campaignReadTimeoutMs);
    });
    const value = await Promise.race([operation(), timeout]);
    const elapsedMs = Date.now() - startedAt;
    if (elapsedMs >= 3_000) console.warn("law_campaign_read_slow", { flow, slug, stage, elapsedMs });
    return value;
  } catch (error) {
    const elapsedMs = Date.now() - startedAt;
    const timeout = error instanceof CampaignReadTimeoutError;
    console.error("law_campaign_read_failed", {
      flow,
      slug,
      stage,
      elapsedMs,
      timeout,
      code: typeof error === "object" && error !== null && "code" in error ? String(error.code ?? "") || null : null,
      message: error instanceof Error ? error.message : "Erro desconhecido.",
    });
    if (error instanceof LawStudyApiError) throw error;
    throw new LawStudyApiError(503, "Não foi possível carregar seu Estudo Ativo da Lei. Tente novamente.");
  } finally {
    if (timer) clearTimeout(timer);
  }
}

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

async function referenceCampaignId(context: StudyContext, state: Awaited<ReturnType<typeof getCampaignFor>>) {
  if (state.campaignId) return state.campaignId;
  if (state.status !== "concluida") return null;
  const { data, error } = await context.supabase.from("campanhas_leis_alunos").select("id").eq("aluno_id", context.studentId).eq("lei_id", context.lawId).eq("concluida", true).eq("abandonada", false).order("concluida_em", { ascending: false }).limit(1).maybeSingle();
  if (error) throw new LawStudyApiError(503, "Não foi possível carregar as respostas da campanha.");
  return data?.id ?? null;
}

/** O progresso da lei sempre usa as questões ativas e as respostas da campanha de referência. */
async function currentLawProgress(context: StudyContext, state: Awaited<ReturnType<typeof getCampaignFor>>) {
  const campaignId = await referenceCampaignId(context, state);
  const [questions, answers] = await Promise.all([
    mainQuestions(context.lawId),
    campaignId ? context.supabase.from("campanhas_leis_respostas").select("questao_id").eq("campanha_id", campaignId) : Promise.resolve({ data: [], error: null }),
  ]);
  if (answers.error) throw new LawStudyApiError(503, "Não foi possível carregar as respostas da campanha.");
  const availableIds = new Set(questions.map((question) => question.id));
  const answered = new Set((answers.data ?? []).flatMap((answer) => typeof answer.questao_id === "string" && availableIds.has(answer.questao_id) ? [answer.questao_id] : []));
  const total = availableIds.size;
  const answeredCount = answered.size;
  return { total, answered: answeredCount, unanswered: total - answeredCount, progress: total ? Math.round(answeredCount / total * 100) : 0, completed: total > 0 && answeredCount === total };
}

export async function getCampaign(request: Request, slug: string) {
  return getCampaignFor(await authorizeLawStudy(request, slug));
}

/** Leitura exclusiva para modos não competitivos; nunca cria nem altera campanha. */
export async function testCampaignAnswers(request: Request, slug: string) {
  const context = await authorizeLawStudy(request, slug);
  const state = await getCampaignFor(context);
  const campaignId = await referenceCampaignId(context, state);
  if (!campaignId) return { campaignId: null, answers: [] as Array<{ questionId: string; correct: boolean }> };
  const { data, error } = await context.supabase.from("campanhas_leis_respostas").select("questao_id,correta").eq("campanha_id", campaignId);
  if (error) throw new LawStudyApiError(503, "Não foi possível carregar as respostas da campanha.");
  return { campaignId, answers: (data ?? []).flatMap((row) => typeof row.questao_id === "string" && typeof row.correta === "boolean" ? [{ questionId: row.questao_id, correct: row.correta }] : []) };
}

export async function startCampaign(request: Request, slug: string) {
  const context = await authorizeLawStudy(request, slug);
  const { supabase, lawId, studentId } = context;
  const current = await getCampaignFor(context);
  if (current.status === "concluida") return campaignStateFor(context);
  if (!current.campaignId) {
    const snapshot = await loadQuestionSnapshot(lawId, context.title);
    let created = true;
    const competitiveStartedAt = new Date().toISOString();
    let { data: campaign, error } = await supabase.from("campanhas_leis_alunos").insert({ aluno_id: studentId, lei_id: lawId, score_version: 2, score: 0, score_competitivo_acertos: 0, score_competitivo_erros: 0, score_competitivo_iniciado_em: competitiveStartedAt, score_competitivo_atualizado_em: competitiveStartedAt }).select("id").single();
    if (error?.code === "23505") {
      created = false;
      const existing = await supabase.from("campanhas_leis_alunos").select("id").eq("aluno_id", studentId).eq("lei_id", lawId).eq("concluida", false).eq("abandonada", false).maybeSingle();
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

/** Reabre a própria campanha concluída somente para as questões ativas que ela ainda não respondeu. */
async function reopenCompletedCampaign(context: StudyContext, campaignId: string) {
  const snapshot = await loadQuestionSnapshot(context.lawId, context.title);
  const [{ data: levels, error: levelsError }, { data: answers, error: answersError }] = await Promise.all([
    context.supabase.from("campanhas_leis_niveis").select("id,ordem,chave_origem,questoes_ids").eq("campanha_id", campaignId).order("ordem"),
    context.supabase.from("campanhas_leis_respostas").select("questao_id").eq("campanha_id", campaignId),
  ]);
  if (levelsError || answersError) throw new LawStudyApiError(503, "Não foi possível retomar seu Estudo Ativo da Lei.");
  const answered = new Set((answers ?? []).flatMap((answer) => typeof answer.questao_id === "string" ? [answer.questao_id] : []));
  const existing = new Map((levels ?? []).map((level) => [level.chave_origem, { id: level.id, ordem: level.ordem, ids: arrayOfStrings(level.questoes_ids) }]));
  for (const level of snapshot.levels) {
    const current = existing.get(level.chave);
    const additions = level.ids.filter((id) => !current?.ids.includes(id) && !answered.has(id));
    if (!current || !additions.length) continue;
    const { error } = await context.supabase.from("campanhas_leis_niveis").update({ questoes_ids: [...current.ids, ...additions], concluido: false }).eq("id", current.id);
    if (error) throw new LawStudyApiError(503, "Não foi possível retomar seu Estudo Ativo da Lei.");
  }
  const nextOrder = Math.max(-1, ...(levels ?? []).map((level) => level.ordem)) + 1;
  const newLevels = snapshot.levels.flatMap((level, index) => !existing.has(level.chave) ? [{ campanha_id: campaignId, ordem: nextOrder + index, chave_origem: level.chave, nome: level.nome, questoes_ids: level.ids.filter((id) => !answered.has(id)) }] : []).filter((level) => level.questoes_ids.length);
  if (newLevels.length) { const { error } = await context.supabase.from("campanhas_leis_niveis").insert(newLevels); if (error) throw new LawStudyApiError(503, "Não foi possível retomar seu Estudo Ativo da Lei."); }
  const [{ error: campaignError }, { error: progressError }] = await Promise.all([
    context.supabase.from("campanhas_leis_alunos").update({ concluida: false, concluida_em: null }).eq("id", campaignId).eq("concluida", true),
    context.supabase.from("progresso_leis_alunos").update({ status_campanha: "em_andamento", questoes_finalizadas: false, campanha_ativa_id: campaignId }).eq("aluno_id", context.studentId).eq("lei_id", context.lawId),
  ]);
  if (campaignError || progressError) throw new LawStudyApiError(503, "Não foi possível retomar seu Estudo Ativo da Lei.");
}

/** Corrige snapshots que ficaram sem próximo bloco após conteúdo novo/reimportado. */
async function reconcileOpenCampaign(context: StudyContext, campaignId: string) {
  const snapshot = await loadQuestionSnapshot(context.lawId, context.title);
  const [{ data: rawLevels, error: levelsError }, { data: answers, error: answersError }] = await Promise.all([
    context.supabase.from("campanhas_leis_niveis").select("id,ordem,chave_origem,questoes_ids,proxima_posicao,pendencias_ids,concluido").eq("campanha_id", campaignId).order("ordem"),
    context.supabase.from("campanhas_leis_respostas").select("questao_id").eq("campanha_id", campaignId),
  ]);
  if (levelsError || answersError) throw new LawStudyApiError(503, "Não foi possível retomar seu Estudo Ativo da Lei.");
  const levels = (rawLevels ?? []).map((level) => ({ ...level, chave_origem: typeof level.chave_origem === "string" ? level.chave_origem : null, questoes_ids: arrayOfStrings(level.questoes_ids), pendencias_ids: arrayOfStrings(level.pendencias_ids) }));
  const answered = new Set((answers ?? []).flatMap((answer) => typeof answer.questao_id === "string" ? [answer.questao_id] : []));
  const { repairs, additions } = reconcileOpenCampaignLevels(levels, snapshot.levels, answered);
  if (!repairs.length && !additions.length) return false;
  for (const repair of repairs) {
    const { error } = await context.supabase.from("campanhas_leis_niveis").update({ questoes_ids: repair.questoesIds, pendencias_ids: repair.pendenciasIds, concluido: repair.concluido }).eq("id", repair.id).eq("campanha_id", campaignId);
    if (error) throw new LawStudyApiError(503, "Não foi possível retomar seu Estudo Ativo da Lei.");
  }
  if (additions.length) {
    const { error } = await context.supabase.from("campanhas_leis_niveis").insert(additions.map((level) => ({ campanha_id: campaignId, ...level })));
    if (error) throw new LawStudyApiError(503, "Não foi possível retomar seu Estudo Ativo da Lei.");
  }
  return true;
}

type CampaignStateOptions = { reconcile?: boolean; includeLawProgress?: boolean };

async function campaignStateFor(context: StudyContext, options: CampaignStateOptions = {}) {
  const { reconcile = true, includeLawProgress = true } = options;
  const { supabase, lawId, studentId } = context;
  const state = await getCampaignFor(context);
  let bestScore: number | null = null;
  let record: { score: number; correct: number; errors: number } | null = null;
  let result: { score: number; bestScore: number; correct: number; errors: number; position?: number; personalRecord: ReturnType<typeof personalRecordForAttempt> } | null = null;
  const { data: historyData, error: historyError } = await supabase.from("campanhas_leis_alunos").select("id,score,score_ajustado,total_erros,concluida_em,score_version,score_competitivo_acertos,score_competitivo_erros").eq("aluno_id", studentId).eq("lei_id", lawId).eq("score_version", 2);
  if (historyError) throw new LawStudyApiError(503, "Não foi possível carregar seu Estudo Ativo da Lei.");
  const history = historyData ?? [];
  const winningCampaign = bestCompletedCampaignForRecord(history);
  bestScore = winningCampaign ? effectiveCampaignScore(winningCampaign) : null;
  if (winningCampaign && bestScore !== null) {
    record = { score: bestScore, correct: winningCampaign.score_competitivo_acertos ?? 0, errors: winningCampaign.score_competitivo_erros ?? 0 };
  }
  const lawProgress = includeLawProgress ? await currentLawProgress(context, state) : null;
  if (reconcile && state.status === "em_andamento" && state.campaignId && await reconcileOpenCampaign(context, state.campaignId)) return campaignStateFor(context, options);
  if (reconcile && state.status === "concluida" && state.campaignId === null && lawProgress && !lawProgress.completed) {
    const campaignId = await referenceCampaignId(context, state);
    if (campaignId) { await reopenCompletedCampaign(context, campaignId); return campaignStateFor(context, options); }
  }
  if (state.status === "concluida") {
    const [latest, ranking] = await Promise.all([
      supabase.from("campanhas_leis_alunos").select("id,score,score_ajustado,score_competitivo_acertos,score_competitivo_erros").eq("aluno_id", studentId).eq("lei_id", lawId).eq("score_version", 2).eq("concluida", true).order("concluida_em", { ascending: false }).limit(1).maybeSingle(),
      supabase.rpc("obter_resultado_campanha_lei", { p_aluno_id: studentId, p_lei_id: lawId }),
    ]);
    if (latest.error || ranking.error) throw new LawStudyApiError(503, "Não foi possível carregar seu Estudo Ativo da Lei.");
    const rankingRow = Array.isArray(ranking.data) ? ranking.data[0] : null;
    const position = Number(rankingRow?.posicao);
    const rankingPosition = Number.isSafeInteger(position) && position > 0 ? position : null;
    const latestCampaign = latest.data;
    const latestScore = typeof latestCampaign?.score_ajustado === "number" ? latestCampaign.score_ajustado : latestCampaign?.score;
    if (latestCampaign && typeof latestScore === "number") {
      const previousCampaigns = history.filter((campaign) => campaign.id !== latestCampaign.id);
      result = { score: latestScore, bestScore: bestScore ?? latestScore, correct: latestCampaign.score_competitivo_acertos ?? 0, errors: latestCampaign.score_competitivo_erros ?? 0, position: rankingPosition ?? undefined, personalRecord: personalRecordForAttempt(latestScore, previousCampaigns) };
    }
  }
  if (!state.campaignId) return { ...state, bestScore, record, result, lawProgress: lawProgress ?? undefined, level: null, question: null, progress: state.status === "concluida" ? 100 : 0 };
  const [{ data: levels, error }, { data: activeCampaign, error: activeCampaignError }] = await Promise.all([
    supabase.from("campanhas_leis_niveis").select("id,ordem,chave_origem,nome,questoes_ids,proxima_posicao,pendencias_ids,total_erros,score_competitivo_acertos,score_competitivo_erros,concluido").eq("campanha_id", state.campaignId).order("ordem"),
    supabase.from("campanhas_leis_alunos").select("score_version,score_competitivo_acertos,score_competitivo_erros,score").eq("id", state.campaignId).single(),
  ]);
  if (error) throw new LawStudyApiError(503, "Não foi possível carregar seu Estudo Ativo da Lei.");
  if (activeCampaignError || !activeCampaign) throw new LawStudyApiError(503, "Não foi possível carregar seu score atual.");
  const parsed = (levels ?? []).map((level) => ({ ...level, questoes_ids: arrayOfStrings(level.questoes_ids), pendencias_ids: arrayOfStrings(level.pendencias_ids) })) as Level[];
  const level = parsed.find((item) => !item.concluido) ?? null;
  const all = parsed.flatMap((item) => item.questoes_ids); const completed = parsed.filter((item) => item.concluido).flatMap((item) => item.questoes_ids).length;
  const levelSummary = parsed.map((item) => ({ id: item.id, chave: item.chave_origem ?? "", nome: item.nome, concluido: item.concluido, posicao: item.proxima_posicao, totalQuestoes: item.questoes_ids.length, revisando: item.proxima_posicao >= item.questoes_ids.length && item.pendencias_ids.length > 0 }));
  if (!level) return { ...state, bestScore, record, score: activeCampaign.score ?? 0, scoreVersion: activeCampaign.score_version, correct: activeCampaign.score_version === 2 ? activeCampaign.score_competitivo_acertos : undefined, errors: activeCampaign.score_version === 2 ? activeCampaign.score_competitivo_erros : undefined, lawProgress: lawProgress ?? undefined, level: null, levels: levelSummary, question: null, progress: all.length ? Math.round(completed / all.length * 100) : 100 };
  const questionId = level.proxima_posicao < level.questoes_ids.length ? level.questoes_ids[level.proxima_posicao] : level.pendencias_ids[0];
  const [questions, structure] = await Promise.all([mainQuestionsByIds(lawId, level.questoes_ids), mainStructure(lawId)]);
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
  return { ...state, bestScore, record, score: activeCampaign.score ?? 0, scoreVersion: activeCampaign.score_version, correct: activeCampaign.score_version === 2 ? activeCampaign.score_competitivo_acertos : undefined, errors: activeCampaign.score_version === 2 ? activeCampaign.score_competitivo_erros : undefined, lawProgress: lawProgress ?? undefined, structure, level: { id: level.id, nome: level.nome, concluded: false, position: level.proxima_posicao, firstPassProgress, reviewing, questions: orderedQuestions }, levels: levelSummary, question, progress: all.length ? Math.round((completed + activeDone) / all.length * 100) : 0 };
}

export async function campaignState(request: Request, slug: string) {
  const context = await campaignReadStep("player", slug, "autorizacao", () => authorizeLawStudy(request, slug));
  return campaignReadStep("player", slug, "estado", () => campaignStateFor(context, { reconcile: false, includeLawProgress: false }));
}

async function completedCampaignSummary(slug: string, context: StudyContext, history: Array<{ id: string; score: number | null; score_ajustado: number | null; score_competitivo_acertos: number | null; score_competitivo_erros: number | null }>, bestScore: number | null) {
  const { supabase, lawId, studentId } = context;
  const [latestResult, rankingResult] = await Promise.all([
    campaignReadStep("summary", slug, "ultima_campanha", () => supabase.from("campanhas_leis_alunos").select("id,score,score_ajustado,score_competitivo_acertos,score_competitivo_erros").eq("aluno_id", studentId).eq("lei_id", lawId).eq("score_version", 2).eq("concluida", true).order("concluida_em", { ascending: false }).limit(1).maybeSingle()),
    campaignReadStep("summary", slug, "ranking", () => supabase.rpc("obter_resultado_campanha_lei", { p_aluno_id: studentId, p_lei_id: lawId })),
  ]);
  if (latestResult.error || rankingResult.error) throw new LawStudyApiError(503, "Não foi possível carregar seu Estudo Ativo da Lei.");
  const latest = latestResult.data;
  const score = typeof latest?.score_ajustado === "number" ? latest.score_ajustado : latest?.score;
  const rankingRow = Array.isArray(rankingResult.data) ? rankingResult.data[0] : null;
  const position = Number(rankingRow?.posicao);
  if (!latest || typeof score !== "number") return null;
  return { score, bestScore: bestScore ?? score, correct: latest.score_competitivo_acertos ?? 0, errors: latest.score_competitivo_erros ?? 0, position: Number.isSafeInteger(position) && position > 0 ? position : undefined, personalRecord: personalRecordForAttempt(score, history.filter((campaign) => campaign.id !== latest.id)) };
}

/**
 * Estado estritamente necessário para a página /estudar/lei/[slug].
 * Diferentemente do jogador, esta leitura não reconcilia campanha nem busca
 * questões/estrutura; portanto não executa escrita nem carrega o payload do
 * nível atual a cada abertura da página-resumo.
 */
export async function campaignSummaryState(request: Request, slug: string) {
  const context = await campaignReadStep("summary", slug, "autorizacao", () => authorizeLawStudy(request, slug));
  const { supabase, lawId, studentId } = context;
  const state = await campaignReadStep("summary", slug, "progresso", () => getCampaignFor(context));
  const historyResult = await campaignReadStep("summary", slug, "historico", () => supabase.from("campanhas_leis_alunos").select("id,score,score_ajustado,total_erros,concluida_em,score_version,score_competitivo_acertos,score_competitivo_erros").eq("aluno_id", studentId).eq("lei_id", lawId).eq("score_version", 2));
  if (historyResult.error) {
    console.error("law_campaign_summary_query_failed", { slug, stage: "historico", code: historyResult.error.code ?? null, message: historyResult.error.message, details: historyResult.error.details ?? null, hint: historyResult.error.hint ?? null });
    throw new LawStudyApiError(503, "Não foi possível carregar seu Estudo Ativo da Lei.");
  }
  const history = historyResult.data ?? [];
  const winningCampaign = bestCompletedCampaignForRecord(history);
  const bestScore = winningCampaign ? effectiveCampaignScore(winningCampaign) : null;
  const record = winningCampaign && bestScore !== null ? { score: bestScore, correct: winningCampaign.score_competitivo_acertos ?? 0, errors: winningCampaign.score_competitivo_erros ?? 0 } : null;

  if (!state.campaignId) {
    const result = state.status === "concluida" ? await completedCampaignSummary(slug, context, history, bestScore) : null;
    return { ...state, bestScore, record, result, lawProgress: { total: 0, answered: 0, unanswered: 0, progress: state.status === "concluida" ? 100 : 0, completed: state.status === "concluida" }, level: null, question: null, progress: state.status === "concluida" ? 100 : 0 };
  }

  const [levelsResult, activeCampaignResult] = await Promise.all([
    campaignReadStep("summary", slug, "niveis", () => supabase.from("campanhas_leis_niveis").select("id,ordem,chave_origem,nome,questoes_ids,proxima_posicao,pendencias_ids,concluido").eq("campanha_id", state.campaignId!).order("ordem")),
    campaignReadStep("summary", slug, "campanha_ativa", () => supabase.from("campanhas_leis_alunos").select("score_version,score_competitivo_acertos,score_competitivo_erros,score").eq("id", state.campaignId!).single()),
  ]);
  if (levelsResult.error) {
    console.error("law_campaign_summary_query_failed", { slug, stage: "niveis", code: levelsResult.error.code ?? null, message: levelsResult.error.message, details: levelsResult.error.details ?? null, hint: levelsResult.error.hint ?? null });
    throw new LawStudyApiError(503, "Não foi possível carregar seu Estudo Ativo da Lei.");
  }
  if (activeCampaignResult.error || !activeCampaignResult.data) {
    const error = activeCampaignResult.error;
    console.error("law_campaign_summary_query_failed", { slug, stage: "campanha_ativa", code: error?.code ?? null, message: error?.message ?? "Campanha não encontrada.", details: error?.details ?? null, hint: error?.hint ?? null });
    throw new LawStudyApiError(503, "Não foi possível carregar seu score atual.");
  }

  const levels = (levelsResult.data ?? []).map((level) => ({ ...level, questoes_ids: arrayOfStrings(level.questoes_ids), pendencias_ids: arrayOfStrings(level.pendencias_ids) }));
  const total = levels.reduce((sum, level) => sum + level.questoes_ids.length, 0);
  const answered = levels.reduce((sum, level) => sum + (level.concluido ? level.questoes_ids.length : Math.min(level.proxima_posicao, level.questoes_ids.length)), 0);
  const progress = total ? Math.round(answered / total * 100) : state.status === "concluida" ? 100 : 0;
  const activeCampaign = activeCampaignResult.data;
  const result = state.status === "concluida" ? await completedCampaignSummary(slug, context, history, bestScore) : null;
  return { ...state, bestScore, record, result, score: activeCampaign.score ?? 0, scoreVersion: activeCampaign.score_version, correct: activeCampaign.score_version === 2 ? activeCampaign.score_competitivo_acertos : undefined, errors: activeCampaign.score_version === 2 ? activeCampaign.score_competitivo_erros : undefined, lawProgress: { total, answered, unanswered: Math.max(0, total - answered), progress, completed: state.status === "concluida" }, level: null, question: null, progress };
}

export async function answerCampaign(request: Request, slug: string, value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new LawStudyApiError(400, "Resposta inválida.");
  const body = value as Record<string, unknown>; const questionId = typeof body.questionId === "string" ? body.questionId : null; const selectedAnswer = body.answer === "certo" || body.answer === "errado" ? body.answer : null; const idempotencyKey = typeof body.idempotencyKey === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(body.idempotencyKey) ? body.idempotencyKey : null;
  if (!questionId || !selectedAnswer || !idempotencyKey) throw new LawStudyApiError(400, "Resposta inválida.");
  const context = await authorizeLawStudy(request, slug); const { supabase } = context; const state = await getCampaignFor(context);
  if (state.status !== "em_andamento" || !state.campaignId) throw new LawStudyApiError(409, "Não há Estudo Ativo da Lei em andamento para responder.");
  const { data: rawLevels, error } = await supabase.from("campanhas_leis_niveis").select("id,ordem,nome,questoes_ids,proxima_posicao,pendencias_ids,total_erros,score_competitivo_acertos,score_competitivo_erros,concluido").eq("campanha_id", state.campaignId).order("ordem");
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
  // total_erros: levelErrors é confirmado na mesma transação do score.
  const { data: persistedRows, error: persistError } = await supabase.rpc("registrar_resposta_campanha", { p_campanha_id: state.campaignId, p_nivel_id: level.id, p_questao_id: questionId, p_correta: correct, p_chave_idempotencia: idempotencyKey, p_proxima_posicao: nextPosition, p_proximas_pendencias: nextPending, p_total_erros_nivel: levelErrors, p_conclui_nivel: concludesLevel });
  if (persistError) {
    if (persistError.code === "P0001") throw new LawStudyApiError(409, "A questão atual foi atualizada. Recarregue a página para continuar.");
    console.error("Falha ao registrar resposta da campanha", { code: persistError.code, message: persistError.message, campaignId: state.campaignId, levelId: level.id });
    throw new LawStudyApiError(503, "Não foi possível registrar a resposta. Tente novamente.");
  }
  const persisted = Array.isArray(persistedRows) ? persistedRows[0] : null;
  if (!persisted) throw new LawStudyApiError(503, "Não foi possível salvar sua resposta.");
  const levelCompetitiveCorrect = level.score_competitivo_acertos + (correct ? 1 : 0);
  const levelCompetitiveErrors = level.score_competitivo_erros + (correct ? 0 : 1);
  const levelCompetitiveScore = campaignScore(levelCompetitiveCorrect, levelCompetitiveErrors);
  const isFinal = concludesLevel && levels.every((item) => item.id === level.id || item.concluido);
  let result: { score: number; bestScore: number; position: number; participants: number; correct: number; errors: number; personalRecord: ReturnType<typeof personalRecordForAttempt> } | null = null;
  if (isFinal) {
    const context = await authorizeLawStudy(request, slug);
    const { data: previousCampaigns, error: previousError } = await supabase.from("campanhas_leis_alunos").select("score,score_ajustado").eq("aluno_id", context.studentId).eq("lei_id", context.lawId).eq("score_version", 2).neq("id", state.campaignId);
    if (previousError) throw new LawStudyApiError(503, "Não foi possível concluir seu Estudo Ativo da Lei.");
    const finalScore = campaignScore(Number(persisted.score_competitivo_acertos), Number(persisted.score_competitivo_erros));
    const { data: finishedCampaign, error: finishError } = await supabase.from("campanhas_leis_alunos").update({ concluida: true, concluida_em: new Date().toISOString(), score: finalScore }).eq("id", state.campaignId).eq("concluida", false).select("id");
    if (finishError) throw new LawStudyApiError(503, "Não foi possível concluir seu Estudo Ativo da Lei.");
    if (!finishedCampaign?.length) throw new LawStudyApiError(409, "Este Estudo Ativo da Lei já foi concluído.");
    const { error: progressError } = await supabase.from("progresso_leis_alunos").update({ status_campanha: "concluida", questoes_finalizadas: true, campanha_ativa_id: null }).eq("campanha_ativa_id", state.campaignId);
    if (progressError) throw new LawStudyApiError(503, "Não foi possível concluir seu Estudo Ativo da Lei.");
    const { data: ranking, error: rankingError } = await supabase.rpc("obter_resultado_campanha_lei", { p_aluno_id: context.studentId, p_lei_id: context.lawId });
    const row = Array.isArray(ranking) ? ranking[0] : null;
    if (rankingError || !row) throw new LawStudyApiError(503, "Não foi possível calcular seu resultado.");
    result = { score: row.score_atual, bestScore: row.melhor_score, position: Number(row.posicao), participants: Number(row.participantes), correct: Number(persisted.score_competitivo_acertos), errors: Number(persisted.score_competitivo_erros), personalRecord: personalRecordForAttempt(finalScore, previousCampaigns ?? []) };
  }
  const totalQuestions = levels.flatMap((item) => item.questoes_ids).length;
  const completedBeforeCurrentLevel = levels.filter((item) => item.id !== level.id && item.concluido).flatMap((item) => item.questoes_ids).length;
  const currentLevelFirstPassCompleted = Math.min(nextPosition, level.questoes_ids.length);
  const globalCompletedQuestions = completedBeforeCurrentLevel + currentLevelFirstPassCompleted;
  const nextQuestionId = !isFinal && !concludesLevel ? nextPosition < level.questoes_ids.length ? level.questoes_ids[nextPosition] : nextPending[0] ?? null : null;
  return { levelConcluded: concludesLevel, campaignConcluded: isFinal, score: Number(persisted.score), correct: Number(persisted.score_competitivo_acertos), errors: Number(persisted.score_competitivo_erros), progress: totalQuestions ? Math.round(globalCompletedQuestions / totalQuestions * 100) : 100, next: nextQuestionId ? { questionId: nextQuestionId, position: nextPosition, reviewing: nextPosition >= level.questoes_ids.length && nextPending.length > 0 } : null, levelResult: concludesLevel ? { correct: levelCompetitiveCorrect, errors: levelCompetitiveErrors, score: levelCompetitiveScore } : null, result };
}

/** O reset arquiva a tentativa aberta e preserva todo o histórico de respostas. */
export async function resetCampaign(request: Request, slug: string) {
  const { supabase, lawId, studentId } = await authorizeLawStudy(request, slug);
  const { data: current, error: currentError } = await supabase.from("progresso_leis_alunos").select("campanha_ativa_id").eq("aluno_id", studentId).eq("lei_id", lawId).maybeSingle();
  if (currentError) throw new LawStudyApiError(503, "Não foi possível resetar seu Estudo Ativo da Lei.");
  if (typeof current?.campanha_ativa_id === "string") {
    const { data: archivedCampaign, error: archiveError } = await supabase.from("campanhas_leis_alunos").update({ abandonada: true }).eq("id", current.campanha_ativa_id).eq("concluida", false).eq("abandonada", false).select("id");
    if (archiveError || !archivedCampaign?.length) throw new LawStudyApiError(503, "Não foi possível resetar seu Estudo Ativo da Lei.");
  }
  const { error } = await supabase.from("progresso_leis_alunos").upsert({ aluno_id: studentId, lei_id: lawId, em_estudo: false, questoes_finalizadas: false, status_campanha: "nao_iniciada", campanha_ativa_id: null }, { onConflict: "aluno_id,lei_id" });
  if (error) throw new LawStudyApiError(503, "Não foi possível resetar seu Estudo Ativo da Lei.");
  return { status: "nao_iniciada" };
}

export { cacheHeaders };
