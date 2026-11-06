import { describe, expect, it } from "vitest";
import {
  DOCTRINE_APKG_FIELDS,
  doctrineRowsFromTransfer,
  previewDoctrineImport,
} from "./doctrine-import-contract";

const id = "7ea93a63-951d-4f08-b90f-d3d460981a50";
const fields = [
  id, "Direito Administrativo", "", "Estado", "001", "105",
  "Assertiva.", "Certo", "Justificativa.", "Resumo.", "", "",
];

describe("transferência APKG de doutrina", () => {
  it("converte campos e localização do deck sem inventar artigo ou slug", () => {
    const rows = doctrineRowsFromTransfer({
      noteColumns: ["id", "guid", "mid", "did", "tags", "fields"],
      fieldNames: DOCTRINE_APKG_FIELDS,
      decks: { "10": { name: "Direito Administrativo::01 - Noções" } },
      notes: [[1, id, 2, 10, "", fields]],
    });

    expect(rows).toHaveLength(1);
    expect(rows[0].deck).toEqual(["Direito Administrativo", "01 - Noções"]);
    expect(rows[0].ordem).toBe("001");
    expect(previewDoctrineImport(rows).issues).toEqual([]);
  });

  it("rejeita transferência incompatível ou com deck ausente", () => {
    expect(() => doctrineRowsFromTransfer({ noteColumns: [], fieldNames: [], decks: {}, notes: [] })).toThrow("Formato de notas");
    expect(() => doctrineRowsFromTransfer({
      noteColumns: ["id", "guid", "mid", "did", "tags", "fields"],
      fieldNames: DOCTRINE_APKG_FIELDS,
      decks: {},
      notes: [[1, id, 2, 10, "", fields]],
    })).toThrow("baralho desconhecido");
  });
});
