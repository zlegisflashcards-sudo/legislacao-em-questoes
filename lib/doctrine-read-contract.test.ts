import { describe, expect, it } from "vitest";
import { doctrineReadPayload, doctrineTopicOrder, resolveDoctrineTopicLink } from "./doctrine-read-contract";

describe("leitura de doutrina", () => {
  it("aceita somente a ordem global de três dígitos", () => {
    expect(doctrineTopicOrder(null)).toBeNull();
    expect(doctrineTopicOrder("001")).toBe("001");
    expect(doctrineTopicOrder("1")).toBeUndefined();
    expect(doctrineTopicOrder("art. 1")).toBeUndefined();
  });
  it("não deixa UUID de outro conteúdo cair na Ordem e usa Ordem em cards antigos", () => {
    const rows = [{ id: "7ea93a63-951d-4f08-b90f-d3d460981a50", ordem: "001" }];
    expect(resolveDoctrineTopicLink(rows, "8ea93a63-951d-4f08-b90f-d3d460981a50", "001")).toBeNull();
    expect(resolveDoctrineTopicLink(rows, null, "001")).toBe("001");
    expect(resolveDoctrineTopicLink(rows, null, "999")).toBeNull();
  });

  it("rotula a resposta como tópico, não artigo", () => {
    expect(doctrineReadPayload({ slug: "direito-administrativo", titulo: "Direito Administrativo" }, [], "001"))
      .toMatchObject({ contentType: "doutrina", topicLabel: "Tópico", total: 0 });
  });
});
