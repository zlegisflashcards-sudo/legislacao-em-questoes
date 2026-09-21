import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { buildCampaignSnapshot } from "./law-campaign-snapshot";

const server = readFileSync("lib/law-campaign-server.ts", "utf8");
const player = readFileSync("components/legis-questoes-study-client.tsx", "utf8");

describe("avanço do Estudo Ativo por blocos", () => {
  it("ordena os blocos pela primeira questão e mantém o próximo bloco disponível", () => {
    const snapshot = buildCampaignSnapshot("Lei de teste", [
      { id: "q-20", structure_id: 20, ordem: "0020.0.00.00" },
      { id: "q-10", structure_id: 10, ordem: "0010.0.00.00" },
    ], [
      { id: 20, parent_id: null, nome: "Título II" },
      { id: 10, parent_id: null, nome: "Título I" },
    ]);

    expect(snapshot.levels).toEqual([
      { nome: "Título I", chave: "estrutura:10", ids: ["q-10"] },
      { nome: "Título II", chave: "estrutura:20", ids: ["q-20"] },
    ]);
  });

  it("conclui somente o bloco atual e o cliente carrega o próximo sem reiniciar a campanha", () => {
    expect(server).toContain('const level = levels.find((item) => !item.concluido);');
    expect(server).toContain('const isFinal = concludesLevel && levels.every((item) => item.id === level.id || item.concluido);');
    expect(server).toContain('levelConcluded: concludesLevel, campaignConcluded: isFinal');
    expect(player).toContain('if (result.levelConcluded)');
    expect(player).toContain('setLevelDone({ name: current.level?.nome ?? ""');
    expect(player).toContain('onContinue={() => { setLevelDone(null); void load(); }}');
  });

  it("preserva score e respostas ao abrir o próximo bloco", () => {
    expect(server).toContain('score: Number(persisted.score), correct: Number(persisted.score_competitivo_acertos), errors: Number(persisted.score_competitivo_erros)');
    expect(player).toContain('const confirmedScore = typeof result.score === "number" ? result.score : current.score;');
    expect(player).toContain('const competitiveResult = { score: confirmedScore');
  });
});

describe("reabertura ao entrar conteúdo novo", () => {
  it("não confunde questões novas por bloco com a transição competitiva", () => {
    expect(server).not.toContain("newQuestionCountsByStructure");
    expect(readFileSync("lib/law-new-questions.ts", "utf8")).not.toContain("campanhas_leis_niveis");
  });

  it("reativa a mesma campanha concluída somente para questões ativas ainda não respondidas", () => {
    const reopen = server.slice(server.indexOf("async function reopenCompletedCampaign"), server.indexOf("async function campaignStateFor"));
    expect(server).toContain('if (state.status === "concluida" && state.campaignId === null && !lawProgress.completed)');
    expect(server).toContain('await reopenCompletedCampaign(context, campaignId)');
    expect(reopen).toContain('const additions = level.ids.filter((id) => !current?.ids.includes(id) && !answered.has(id));');
    expect(reopen).toContain('update({ concluida: false, concluida_em: null }).eq("id", campaignId).eq("concluida", true)');
    expect(reopen).toContain('campanha_ativa_id: campaignId');
    expect(reopen).not.toContain('score:');
  });
});
