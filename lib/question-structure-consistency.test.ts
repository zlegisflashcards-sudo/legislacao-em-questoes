import { describe, expect, it } from "vitest";
import { parseQuestionSubject, questionStructureIssues, legislationGroups } from "./question-structure-consistency";

describe("consistência estrutural de flashcards", () => {
  it("interpreta artigo, letra, parágrafo, inciso e alínea", () => {
    expect(parseQuestionSubject("Art. 10")).toMatchObject({ article: "10" });
    expect(parseQuestionSubject('Art. 11-A, parágrafo único')).toMatchObject({ article: "11", suffix: "A", unique: true });
    expect(parseQuestionSubject("Art. 10, § 1º")).toMatchObject({ paragraph: "1" });
    expect(parseQuestionSubject("Art. 10, § 1º, II")).toMatchObject({ item: "II" });
    expect(parseQuestionSubject('Art. 10, § 1º, II, "a"')).toMatchObject({ article: "10", paragraph: "1", item: "II", letter: "a" });
  });
  it("aponta somente divergências detectáveis", () => {
    expect(questionStructureIssues({ assunto: "Art. 10, § 1º", ordem: "0010.0.00.00", legislacao: "x" }).map((item) => item.code)).toContain("paragrafo_caput");
    expect(questionStructureIssues({ assunto: "Art. 10", ordem: "0010.0.00.00", legislacao: "x" })).toEqual([]);
    expect(questionStructureIssues({ assunto: "Art. 11", ordem: "0010.0.00.00", legislacao: "x" }).map((item) => item.code)).toContain("artigo_divergente");
    expect(questionStructureIssues({ assunto: "Art. 10, § 1º, II", ordem: "0010.0.01.00", legislacao: "x" }).map((item) => item.code)).toContain("inciso_incompleto");
    expect(questionStructureIssues({ assunto: 'Art. 10, § 1º, II, "a"', ordem: "0010.0.01.02", legislacao: "x" }).map((item) => item.code)).toContain("alinea_incompleta");
    expect(questionStructureIssues({ assunto: null, ordem: null, legislacao: null }).map((item) => item.code)).toEqual(["assunto_ausente", "ordem_ausente", "legislacao_ausente"]);
  });
  it("agrupa versões de legislação sem escolher uma", () => expect(legislationGroups([{ legislacao: "A" }, { legislacao: "B" }, { legislacao: "A" }])).toEqual([{ value: "A", count: 2 }, { value: "B", count: 1 }]));
});
