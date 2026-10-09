import { describe, expect, it } from "vitest";
import { expectedQuestionOrder, hasIncisoGranularityPending, parseQuestionOrder, parseQuestionSubject, validateQuestionStructure } from "./question-structure-consistency";

describe("validador estrutural Assunto × Ordem", () => {
  const validate = (assunto: string, ordem: string, lawShortName?: string) => validateQuestionStructure({ assunto, ordem, lawShortName });
  it("valida artigo simples", () => expect(validate("Art. 1º", "0001.0.00.0.00.0").status).toBe("valid"));
  it("valida artigo com letra", () => expect(validate("Art. 1º-A", "0001.a.00.0.00.0").status).toBe("valid"));
  it("detecta letra de artigo ausente", () => expect(validate("Art. 1º-A", "0001.0.00.0.00.0")).toMatchObject({ status: "conflict", expectedOrder: "0001.a.00.0.00.0" }));
  it("valida parágrafo simples", () => expect(validate("Art. 27-B, § 1º", "0027.b.01.0.00.0").status).toBe("valid"));
  it("trata parágrafo único como parágrafo 01 na ordem", () => {
    expect(validate("Art. 3º, parágrafo único", "0003.0.01.0.00.0")).toMatchObject({ status: "valid", expectedOrder: "0003.0.01.0.00.0" });
    expect(validate("Art. 3º, parágrafo único", "0003.0.00.0.00.0")).toMatchObject({ status: "conflict", expectedOrder: "0003.0.01.0.00.0" });
  });
  it("valida parágrafo com letra", () => expect(validate("Art. 27-B, § 1º-C", "0027.b.01.c.00.0").status).toBe("valid"));
  it("detecta letra de parágrafo ausente", () => expect(validate("Art. 27-B, § 1º-C", "0027.b.01.0.00.0")).toMatchObject({ status: "conflict", expectedOrder: "0027.b.01.c.00.0" }));
  it("valida inciso", () => expect(validate("Art. 27-B, § 1º-C, II", "0027.b.01.c.02.0").status).toBe("valid"));
  it("valida inciso citado diretamente após o artigo", () => {
    expect(validate("Art. 40, VI, Lei Estadual 6.513/95 - MA", "0040.0.00.0.06.0")).toMatchObject({ status: "valid", expectedOrder: "0040.0.00.0.06.0" });
    expect(validate("Art. 40, VI, Lei Estadual 6.513/95 - MA", "0040.0.00.0.00.0")).toMatchObject({ status: "conflict", expectedOrder: "0040.0.00.0.06.0" });
  });
  it("valida inciso com letra", () => expect(validate("Art. 27-B, § 1º-C, II-A", "0027.b.01.c.02.a").status).toBe("valid"));
  it.each([
    ["artigo", "Art. 1º-A", "0001.a.00.0.00.0"],
    ["parágrafo", "Art. 27-B, § 1º-C", "0027.b.01.c.00.0"],
    ["inciso", "Art. 27-B, § 1º-C, II-B", "0027.b.01.c.02.b"],
  ])("aceita letra estrutural válida no %s", (_level, assunto, ordem) => {
    expect(validate(assunto, ordem)).toMatchObject({ status: "valid", expectedOrder: ordem });
  });
  it.each([
    ["Art. 27-B", "0027.0.00.0.00.0", "0027.b.00.0.00.0"],
    ["Art. 27", "0027.b.00.0.00.0", "0027.0.00.0.00.0"],
    ["Art. 27-B, § 1º-C", "0027.b.01.0.00.0", "0027.b.01.c.00.0"],
    ["Art. 27-B, § 1º", "0027.b.01.c.00.0", "0027.b.01.0.00.0"],
    ["Art. 27-B, § 1º-C, II-B", "0027.b.01.c.02.0", "0027.b.01.c.02.b"],
  ])("sinaliza conflito somente quando Assunto e Ordem divergem", (assunto, ordem, expectedOrder) => {
    expect(validate(assunto, ordem)).toMatchObject({ status: "conflict", expectedOrder });
  });
  it("valida alínea no campo final de letra da Ordem", () => {
    expect(validate("Art. 27-B, § 1º-C, II, alínea a", "0027.b.01.c.02.a")).toMatchObject({
      status: "valid",
      expectedOrder: "0027.b.01.c.02.a",
    });
  });
  it("não confunde Art. 91 com Art. 91-A", () => expect(validate("Art. 91-A", "0091.0.00.0.00.0").status).toBe("conflict"));
  it("preserva zero como ausência de letra sem colidir com letra", () => {
    expect(parseQuestionOrder("0001.0.00.0.00.0")).toMatchObject({ artigo: "1", letraArtigo: undefined });
    expect(parseQuestionOrder("0001.a.00.0.00.0")).toMatchObject({ artigo: "1", letraArtigo: "A" });
  });
  it("sinaliza assunto ambíguo sem sugerir correção", () => expect(validateQuestionStructure({ assunto: "Disposição geral", ordem: "0001.0.00.0.00.0" }).status).toBe("possible_conflict"));
  it("confere o nome curto cadastrado da lei no Assunto", () => {
    expect(validate("Art. 11, Lei 8.112/90", "0011.0.00.0.00.0", "Lei 8.112/90")).toMatchObject({ status: "valid" });
    expect(validate("Art. 11, Lei nº 8.112/90", "0011.0.00.0.00.0", "Lei 8.112/90")).toMatchObject({ status: "valid" });
  });
  it("sinaliza lei ou referência divergente sem alterar a ordem", () => {
    expect(validate("Art. 11, Lei 8.113/90", "0011.0.00.0.00.0", "Lei 8.112/90")).toMatchObject({ status: "conflict", differences: expect.arrayContaining(["lei divergente: esperado Lei 8.112/90"]) });
    expect(validate("Art. 11, CF", "0011.0.00.0.00.0", "Lei 8.112/90")).toMatchObject({ status: "conflict", differences: expect.arrayContaining(["referência divergente: esperado Lei 8.112/90"]) });
    expect(validate("Lei 8.113/90", "0011.0.00.0.00.0", "Lei 8.112/90")).toMatchObject({ status: "conflict", differences: expect.arrayContaining(["lei divergente: esperado Lei 8.112/90"]) });
  });
  it("mantém a divergência de artigo independente da referência correta da lei", () => {
    expect(validate("Art. 12, Lei 8.112/90", "0011.0.00.0.00.0", "Lei 8.112/90")).toMatchObject({ status: "conflict", differences: expect.arrayContaining(["artigo na ordem é 11"]) });
  });
  it("mantém helpers reutilizáveis para assunto e ordem", () => {
    expect(parseQuestionSubject("Art. 27-B, § 1º-C, inciso II-A")).toMatchObject({ article: "27", suffix: "B", paragraph: "1", paragraphSuffix: "C", item: "II", itemSuffix: "A" });
    expect(expectedQuestionOrder({ artigo: "27", letraArtigo: "B", paragrafo: "1", letraParagrafo: "C", inciso: "2", letraInciso: "A" })).toBe("0027.b.01.c.02.a");
  });
  it("sinaliza recorte por inciso como pendência editorial, sem conflito estrutural", () => {
    expect(hasIncisoGranularityPending({ assunto: "Art. 121, § 2º-B, inciso II, CP" })).toBe(true);
    expect(hasIncisoGranularityPending({ assunto: "Art. 121, § 2º-B, CP" })).toBe(false);
  });
});
