import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const campaign = readFileSync("lib/law-campaign-server.ts", "utf8");
const questions = readFileSync("lib/questions-main-server.ts", "utf8");
const lawStudy = readFileSync("lib/law-study-server.ts", "utf8");
const snapshot = readFileSync("lib/law-campaign-snapshot.ts", "utf8");
const player = readFileSync("components/legis-questoes-study-client.tsx", "utf8");
const answerActivityMigration = readFileSync("supabase/migrations/20260828170000_create_campaign_answer_activity.sql", "utf8");

describe("performance do Estudo Ativo da Lei", () => {
  it("não reautoriza o mesmo request ao carregar ou responder", () => {
    expect(campaign).toContain("async function getCampaignFor(context: StudyContext)");
    expect(campaign).toContain("const state = await getCampaignFor(context);");
    expect(campaign).not.toContain("const state = await getCampaign(request, slug);");
  });

  it("entrega o estado inicial no POST sem exigir um GET duplicado do cliente", () => {
    expect(campaign).toContain("return campaignStateFor(context);");
  });

  it("paraleliza as consultas independentes de autorização", () => {
    expect(lawStudy).toContain("const [{ data: studentData, error: studentError }, { data: lawData, error: lawError }] = await Promise.all([");
    expect(lawStudy).toContain("const [{ data: passwordStatus, error: passwordStatusError }, { data: accessData, error: accessError }] = await Promise.all([");
  });

  it("busca apenas as questões necessárias após a abertura", () => {
    expect(questions).toContain("export async function mainQuestionById");
    expect(questions).toContain("export async function mainQuestionsByIds");
    expect(campaign).toContain("const snapshotQuestion = await mainQuestionById(context.lawId, questionId);");
    expect(campaign).toContain("const [questions, structure] = await Promise.all([mainQuestionsByIds(lawId, level.questoes_ids), mainStructure(lawId)]);");
    expect(campaign).toContain("const recoveredQuestion = await mainQuestionById(lawId, questionId);");
    expect(campaign).toContain("const orderedQuestions = level.questoes_ids.flatMap");
    expect(campaign).not.toContain("async function questionsByIds");
  });

  it("mantém a montagem do snapshot baseada no slug canônico e em descendentes", () => {
    expect(campaign).toContain("const snapshot = await loadQuestionSnapshot(lawId, context.title);");
    expect(snapshot).toContain("const descendants = (id: number): number[] => [id, ...(children.get(id) ?? []).flatMap(descendants)];");
    expect(snapshot).toContain("ids.has(question.structure_id)");
    expect(snapshot).toContain("left.ordem.localeCompare(right.ordem) || left.id.localeCompare(right.id)");
    expect(snapshot).toContain("questionPosition.get(left.ids[0])");
  });

  it("retoma somente a posição persistida e recria o snapshot a partir do início após reset", () => {
    expect(campaign).toContain("const questionId = level.proxima_posicao < level.questoes_ids.length ? level.questoes_ids[level.proxima_posicao]");
    expect(campaign).toContain('update({ abandonada: true }).eq("id", current.campanha_ativa_id).eq("concluida", false).eq("abandonada", false)');
    expect(campaign).toContain('status_campanha: "nao_iniciada", campanha_ativa_id: null');
    expect(campaign).toContain("if (!current.campaignId) {");
    expect(campaign).toContain("const snapshot = await loadQuestionSnapshot(lawId, context.title);");
    expect(campaign).toContain("score_competitivo_acertos: 0, score_competitivo_erros: 0");
    expect(campaign).toContain("score_competitivo_iniciado_em: competitiveStartedAt");
  });

  it("mantém a janela competitiva V2 separada do histórico pedagógico no estado recarregado", () => {
    expect(campaign).toContain('select("score_version,score_competitivo_acertos,score_competitivo_erros,score")');
    expect(campaign).toContain("scoreVersion: activeCampaign.score_version");
    expect(campaign).toContain("activeCampaign.score_version === 2 ? activeCampaign.score_competitivo_acertos : undefined");
    expect(campaign).toContain("activeCampaign.score_version === 2 ? activeCampaign.score_competitivo_erros : undefined");
  });

  it("não reordena no cliente a questão canônica recebida da campanha", () => {
    const campaignClient = player.slice(player.indexOf("function CampaignStudy"), player.indexOf("function FreeStudy"));
    expect(campaignClient).toContain("const question = campaign?.question;");
    expect(campaignClient).not.toContain("campaign?.level?.questions.sort");
  });

  it("mantém histórico, ranking e recorde fora das respostas intermediárias", () => {
    const answer = campaign.slice(campaign.indexOf("export async function answerCampaign"), campaign.indexOf("export async function resetCampaign"));
    expect(answer.indexOf('supabase.rpc("obter_resultado_campanha_lei"')).toBeGreaterThan(answer.indexOf("if (isFinal)"));
    expect(answer.lastIndexOf("personalRecordForAttempt")).toBeGreaterThan(answer.indexOf("if (isFinal)"));
  });

  it("registra cada resposta do Estudo Ativo pela RPC canônica, nunca pelo navegador", () => {
    const answer = campaign.slice(campaign.indexOf("export async function answerCampaign"), campaign.indexOf("export async function resetCampaign"));
    expect(player).toContain('api("PATCH", { questionId: currentQuestion.id, answer: answerToSave, idempotencyKey })');
    expect(player).toContain("const answerRequestKeys = useRef");
    expect(answer).toContain('supabase.rpc("registrar_resposta_campanha"');
    expect(answer).not.toContain('from("campanhas_leis_respostas").insert');
    expect(answerActivityMigration).toContain("insert into public.campanhas_leis_respostas(campanha_id,nivel_id,questao_id,correta,chave_idempotencia)");
    expect(answerActivityMigration).toContain("respondido_em timestamptz not null default now()");
    expect(answer).toContain("const correct = selectedAnswer === answer;");
    expect(answer).toContain("p_correta: correct");
    expect(answerActivityMigration).toContain("correta boolean not null");
  });

  it("serializa retry concorrente antes de criar atividade e permite a mesma questão em outra campanha", () => {
    expect(answerActivityMigration).toContain("unique (campanha_id, chave_idempotencia)");
    expect(answerActivityMigration).toContain("drop function if exists public.registrar_resposta_campanha(uuid,bigint,text,boolean,integer,jsonb,integer,boolean)");
    expect(answerActivityMigration).toContain("for update;");
    expect(answerActivityMigration).toContain("if exists (select 1 from public.campanhas_leis_respostas");
    expect(answerActivityMigration).toContain("if v_esperada is distinct from p_questao_id then raise exception");
    expect(answerActivityMigration).not.toContain("unique (campanha_id, questao_id)");
    expect(answerActivityMigration).not.toContain("unique(campanha_id,questao_id)");
  });

  it("mantém eventos quando o reset arquiva a tentativa aberta", () => {
    const reset = campaign.slice(campaign.indexOf("export async function resetCampaign"));
    expect(reset).toContain('update({ abandonada: true }).eq("id", current.campanha_ativa_id).eq("concluida", false).eq("abandonada", false)');
    expect(answerActivityMigration).toContain("references public.campanhas_leis_alunos(id) on delete cascade");
    expect(answerActivityMigration).toContain("add column if not exists abandonada boolean not null default false");
    expect(answerActivityMigration).toContain("where not concluida and not abandonada");
  });
});
