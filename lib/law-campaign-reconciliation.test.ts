import { describe, expect, it } from "vitest";

import { reconcileOpenCampaignLevels } from "./law-campaign-reconciliation";

describe("reconciliação da campanha aberta", () => {
  it("mantém o bloco concluído quando UUIDs ativos reimportados ainda não têm resposta", () => {
    const result = reconcileOpenCampaignLevels([{
      id: 10, ordem: 0, chave_origem: "estrutura:132", questoes_ids: ["q-nova"],
      proxima_posicao: 1, pendencias_ids: [], concluido: true,
    }], [{ chave: "estrutura:132", nome: "Capítulo I", ids: ["q-nova"] }], new Set());

    expect(result).toEqual({
      repairs: [{ id: 10, questoesIds: ["q-nova"], pendenciasIds: [], concluido: true }],
      additions: [],
    });
  });

  it("anexa questões novas a um bloco já concluído sem deslocar o nível atual", () => {
    const result = reconcileOpenCampaignLevels([{
      id: 10, ordem: 0, chave_origem: "estrutura:132", questoes_ids: ["respondida"],
      proxima_posicao: 1, pendencias_ids: [], concluido: true,
    }], [{ chave: "estrutura:132", nome: "Capítulo I", ids: ["respondida", "nova"] }], new Set(["respondida"]));

    expect(result.repairs).toEqual([{ id: 10, questoesIds: ["respondida", "nova"], pendenciasIds: [], concluido: true }]);
  });
});
