import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const campaign = readFileSync("lib/law-campaign-server.ts", "utf8");
const questions = readFileSync("lib/questions-main-server.ts", "utf8");
const lawStudy = readFileSync("lib/law-study-server.ts", "utf8");
const snapshot = readFileSync("lib/law-campaign-snapshot.ts", "utf8");

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
    expect(campaign).toContain("const questions = await mainQuestionsByIds(lawId, level.questoes_ids);");
    expect(campaign).toContain("const recoveredQuestion = await mainQuestionById(lawId, questionId);");
    expect(campaign).toContain("const orderedQuestions = level.questoes_ids.flatMap");
    expect(campaign).not.toContain("async function questionsByIds");
  });

  it("mantém a montagem do snapshot baseada no slug canônico e em descendentes", () => {
    expect(campaign).toContain("const snapshot = await loadQuestionSnapshot(lawId, context.title);");
    expect(snapshot).toContain("const descendants = (id: number): number[] => [id, ...(children.get(id) ?? []).flatMap(descendants)];");
    expect(snapshot).toContain("ids.has(question.structure_id)");
  });

  it("mantém histórico, ranking e recorde fora das respostas intermediárias", () => {
    const answer = campaign.slice(campaign.indexOf("export async function answerCampaign"), campaign.indexOf("export async function resetCampaign"));
    expect(answer.indexOf('supabase.rpc("obter_resultado_campanha_lei"')).toBeGreaterThan(answer.indexOf("if (isFinal)"));
    expect(answer.lastIndexOf("personalRecordForAttempt")).toBeGreaterThan(answer.indexOf("if (isFinal)"));
  });
});
