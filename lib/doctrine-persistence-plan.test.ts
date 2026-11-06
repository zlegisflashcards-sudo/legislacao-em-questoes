import { describe, expect, it } from "vitest";
import { DOCTRINE_APKG_FIELDS } from "./doctrine-import-contract";
import { buildDoctrinePersistencePlan } from "./doctrine-persistence-plan";

describe("prévia de persistência de doutrina", () => {
  it("preserva o UUID e não converte tópico em artigo legal", () => {
    const id = "7ea93a63-951d-4f08-b90f-d3d460981a50";
    const plan = buildDoctrinePersistencePlan({
      noteColumns: ["id", "guid", "mid", "did", "tags", "fields"],
      fieldNames: DOCTRINE_APKG_FIELDS,
      decks: { "1": { name: "Direito Administrativo::01 - Noções" } },
      notes: [[1, id, 1, 1, "", [id, "Direito Administrativo", "", "Estado", "001", "105", "Pergunta", "Certo", "Justificativa", "Resumo", "Fonte", "v1"]]],
    });

    expect(plan.structures).toEqual([{ key: "structure-1", nome: "01 - Noções", ordem: 1, tipo: "estrutura" }]);
    expect(plan.questions[0]).toMatchObject({
      id,
      assunto: "Estado",
      ordem: "001",
      totalTopicos: 105,
      fonteReferencia: "Fonte",
      legislacao: null,
      artigo: null,
      totalArtigos: null,
    });
  });
});
