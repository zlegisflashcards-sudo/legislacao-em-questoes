import { describe, expect, it } from "vitest";

import { buildCampaignSnapshot } from "./law-campaign-snapshot";

const question = (id: string, structureId: number, ordem = id) => ({
  id,
  structure_id: structureId,
  pergunta: id,
  resposta: "Certo",
  justificativa: null,
  assunto: null,
  legislacao: null,
  ordem,
  titulo: null,
  capitulo: null,
  secao: null,
  subsecao: null,
  artigo: null,
  ultima_alteracao_legislativa: null,
});

describe("snapshot do Estudo Ativo da Lei", () => {
  it("mantém questões vinculadas aos nós descendentes do capítulo", () => {
    const snapshot = buildCampaignSnapshot("Lei de teste", [question("q-1", 2), question("q-2", 3)], [
      { id: 1, parent_id: null, nome: "Capítulo I" },
      { id: 2, parent_id: 1, nome: "Seção I" },
      { id: 3, parent_id: 1, nome: "Seção II" },
    ]);

    expect(snapshot.levels).toEqual([
      { nome: "Seção I", chave: "estrutura:2", ids: ["q-1"] },
      { nome: "Seção II", chave: "estrutura:3", ids: ["q-2"] },
    ]);
    expect(snapshot.levels.flatMap((level) => level.ids)).toEqual(["q-1", "q-2"]);
  });

  it("inicia a campanha pelo menor ordem, mesmo se a árvore vier em outra sequência", () => {
    const snapshot = buildCampaignSnapshot("Lei de teste", [
      question("q-65", 20, "0065.0.00.00"),
      question("q-2", 10, "0002.0.00.00"),
      question("q-1", 10, "0001.0.00.00"),
    ], [
      { id: 20, parent_id: null, nome: "Título V" },
      { id: 10, parent_id: null, nome: "Título I" },
    ]);

    expect(snapshot.questions.map((item) => item.ordem)).toEqual(["0001.0.00.00", "0002.0.00.00", "0065.0.00.00"]);
    expect(snapshot.levels).toEqual([
      { nome: "Título I", chave: "estrutura:10", ids: ["q-1", "q-2"] },
      { nome: "Título V", chave: "estrutura:20", ids: ["q-65"] },
    ]);
  });

  it("usa o ID somente como desempate estável para ordens idênticas", () => {
    const snapshot = buildCampaignSnapshot("Lei de teste", [
      question("question-b", 1, "0001.0.00.00"),
      question("question-a", 1, "0001.0.00.00"),
    ], [{ id: 1, parent_id: null, nome: "Capítulo I" }]);

    expect(snapshot.levels[0].ids).toEqual(["question-a", "question-b"]);
  });
});
