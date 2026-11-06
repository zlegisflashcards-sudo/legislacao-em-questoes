import { describe, expect, it } from "vitest";
import { DOCTRINE_APKG_FIELDS } from "./doctrine-import-contract";
import { DRAFT_DOCTRINE_SLUG, planDoctrineRegistration } from "./doctrine-registration-plan";

describe("prévia de cadastro de doutrina", () => {
  it("mantém o tipo, o slug local candidato e a ordem global", () => {
    const id = "7ea93a63-951d-4f08-b90f-d3d460981a50";
    const result = planDoctrineRegistration({
      noteColumns: ["id", "guid", "mid", "did", "tags", "fields"],
      fieldNames: DOCTRINE_APKG_FIELDS,
      decks: { "1": { name: "Direito Administrativo::01 - Noções" } },
      notes: [[1, id, 1, 1, "", [id, "Direito Administrativo", "", "Estado", "001", "105", "Pergunta", "Certo", "Justificativa", "", "", ""]]],
    });
    expect(result).toMatchObject({ slug: DRAFT_DOCTRINE_SLUG, titulo: "Direito Administrativo", tipoConteudo: "doutrina", questions: 1, topics: 1 });
    expect(result.structures).toEqual(["01 - Noções"]);
    expect(result.orders).toEqual(["001"]);
    expect(result.errors).toEqual([]);
  });
});
