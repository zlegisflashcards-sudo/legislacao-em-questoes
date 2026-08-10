import { describe, expect, it } from "vitest";
import { matchesLegislationSearch, normalizeLegislationSearch } from "./legislation-search";
import type { Legislacao } from "./legislacoes";

const lei6513 = {
  nome: "Lei nº 6.513/MA",
  categoria: "Legislações",
  slug: "l6513ma",
} as Legislacao;

describe("busca pública de legislação", () => {
  it("normaliza número, pontuação e slug da Lei 6.513", () => {
    expect(normalizeLegislationSearch("6.513")).toBe("6513");
    expect(matchesLegislationSearch(lei6513, "6.513")).toBe(true);
    expect(matchesLegislationSearch(lei6513, "6513")).toBe(true);
    expect(matchesLegislationSearch(lei6513, "L6513/MA")).toBe(true);
    expect(matchesLegislationSearch(lei6513, "Lei nº 6.513/MA")).toBe(true);
  });
});
