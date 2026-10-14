import { describe, expect, it } from "vitest";
import { findLawQuestionArticleGaps } from "./law-question-shadow-gaps";

describe("lacunas automáticas para Artigo Sombra", () => {
  it("encontra artigos numéricos sem questão entre a primeira e a última ordem", () => {
    expect(findLawQuestionArticleGaps([{ ordem: "0001.0.00.00" }, { ordem: "0004.0.00.00" }, { ordem: "0004.0.01.00" }])).toEqual([
      expect.objectContaining({ article: 2, ordem: "0002.0.00.0.00.0", assunto: "Art. 2º" }),
      expect.objectContaining({ article: 3, ordem: "0003.0.00.0.00.0", assunto: "Art. 3º" }),
    ]);
  });

  it("usa ordinal somente até o artigo 9º e inclui o nome curto da lei", () => {
    expect(findLawQuestionArticleGaps([{ ordem: "0008.0.00.00" }, { ordem: "0031.0.00.00" }], "Lei 9.605/98")).toEqual(expect.arrayContaining([
      expect.objectContaining({ article: 9, assunto: "Art. 9º, Lei 9.605/98" }),
      expect.objectContaining({ article: 30, assunto: "Art. 30, Lei 9.605/98" }),
    ]));
  });

  it("não inventa sombra quando não há intervalo suficiente ou a ordem é inválida", () => {
    expect(findLawQuestionArticleGaps([{ ordem: "0001.0.00.00" }])).toEqual([]);
    expect(findLawQuestionArticleGaps([{ ordem: "sem-ordem" }, { ordem: null }])).toEqual([]);
  });
});
