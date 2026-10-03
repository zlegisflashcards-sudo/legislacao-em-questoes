import { describe, expect, it } from "vitest";
import { articleOrderStructure } from "./article-order-structure";

describe("estrutura da ordem do artigo", () => {
  it("reaproveita assunto para nomear parágrafos sem fixar posições da ordem", () => {
    expect(articleOrderStructure("0033.00.00.01.00.00", "Art. 33, § 1º, CP")).toMatchObject({ articleKey: "33", block: "Art. 33", subblock: "§ 1º", reference: "Art. 33, § 1º" });
  });

  it("separa artigo com letra do artigo numérico que compartilha a ordem inicial", () => {
    expect(articleOrderStructure("0091.01.00.01.00.01", "Art. 91-A, § 1º, I, CP")).toMatchObject({ articleKey: "91-A", reference: "Art. 91-A, § 1º, I" });
    expect(articleOrderStructure("0091.00.00.01.00.00", "Art. 91, § 1º, CP")).toMatchObject({ articleKey: "91", reference: "Art. 91, § 1º" });
  });

  it("preserva o sufixo jurídico do parágrafo na referência amigável", () => {
    expect(articleOrderStructure("0121.0.02.b.01", "Art. 121, § 2º-B, inciso II, CP")).toMatchObject({ reference: "Art. 121, § 2º-B, II" });
  });

  it("mantém a ordem como fallback quando o assunto não detalha o subbloco", () => {
    expect(articleOrderStructure("0121.0.02.0.01", null)).toMatchObject({ block: "Art. 121", subblock: "Subbloco 0.02.0.01" });
  });
});
