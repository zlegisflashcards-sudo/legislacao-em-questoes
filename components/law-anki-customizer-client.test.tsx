import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync("components/law-anki-customizer-client.tsx", "utf8");

describe("personalização do baralho Anki", () => {
  it("alterna entre selecionar e desmarcar toda a estrutura", () => {
    expect(source).toContain("const allSelected = nodes.length > 0 && nodes.every");
    expect(source).toContain('if (allSelected) { setInclude([]); setExclude([]); }');
    expect(source).toContain('{allSelected ? "Desmarcar tudo" : "Selecionar tudo"}');
  });
});
