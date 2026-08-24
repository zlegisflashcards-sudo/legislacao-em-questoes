import { describe, expect, it } from "vitest";

import { buildCampaignSnapshot } from "./law-campaign-snapshot";

const question = (id: string, structureId: number) => ({
  id,
  structure_id: structureId,
  pergunta: id,
  resposta: "Certo",
  justificativa: null,
  assunto: null,
  legislacao: null,
  ordem: id,
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
});
