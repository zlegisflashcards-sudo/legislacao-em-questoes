import { describe, expect, it } from "vitest";
import { DOCTRINE_ANKI_MODEL_ID, doctrineAnkiFieldNames, doctrineAnkiGuid, doctrineAnkiUrl } from "@/lib/doctrine-apkg-export";
describe("APKG de doutrina", () => {
  it("não depende de legisbotUrl e cria deep link por UUID, slug e Ordem", () => {
    expect(doctrineAnkiFieldNames).toHaveLength(12);
    expect(doctrineAnkiFieldNames).not.toContain("legisbotUrl");
    expect(doctrineAnkiFieldNames).not.toContain("slug");
    expect(DOCTRINE_ANKI_MODEL_ID).toBe(2316326386);
    expect(doctrineAnkiGuid("7ea93a63-951d-4f08-b90f-d3d460981a50")).toBe("7ea93a63-951d-4f08-b90f-d3d460981a50");
    expect(doctrineAnkiUrl("direito-administrativo", "7ea93a63-951d-4f08-b90f-d3d460981a50", "001")).toBe("https://www.legisflashcards.com.br/doutrina/direito-administrativo?questao=7ea93a63-951d-4f08-b90f-d3d460981a50&ordem=001");
  });
});
