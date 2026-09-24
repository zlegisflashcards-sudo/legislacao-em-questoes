import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("exportação Anki por escopo", () => {
  it("mantém o título canônico da lei como raiz, sem nome de produto ou recorte", () => {
    const source = readFileSync("lib/law-apkg-scope-download-server.ts", "utf8");
    expect(source).toContain("const title = context.title");
    expect(source).not.toContain("LegisFlashcards -");
    expect(source).not.toContain("context.recorte.nome");
  });
});
