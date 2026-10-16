import { describe, expect, it } from "vitest";
import { parseLegislativeDocument } from "./legislative-document-import";

describe("importação de documento legislativo", () => {
  it("cria referências independentes para artigo e sua hierarquia", () => {
    const result = parseLegislativeDocument([
      "Art. 27-B", "Caput do artigo.", "§ 1º-C", "Texto do parágrafo.", "II", "Texto do inciso.", "a)", "Texto da alínea.",
    ]);
    expect(result.rejected).toEqual([]);
    expect(result.references.map((item) => item.ordem)).toEqual(["0027.b.00.0.00.0", "0027.b.01.c.00.0", "0027.b.01.c.02.0", "0027.b.01.c.02.a"]);
    expect(result.references[2].legislation).toBe("Texto do inciso.");
  });

  it("não aceita texto sem um título estrutural", () => {
    const result = parseLegislativeDocument(["Texto solto", "Art. 1º", "Caput."]);
    expect(result.references).toHaveLength(1);
    expect(result.rejected[0]).toContain("texto fora");
  });
});
