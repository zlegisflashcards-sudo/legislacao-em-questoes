import { describe, expect, it } from "vitest";
import { continuousBlockAnchor, continuousLegisBotHref, referenceIdFromHash, resolveContinuousReadingIntegrity, resolveLegacyReferenceId } from "./continuous-reading-core";
import { legisBotOrderCandidates } from "./order-candidates";

const ref = (id: string, ordem: string, prepared = true) => ({ id, slug: "l6513ma", ordem, identificacao: ordem, sourceQuestionId: null, prepared });
const ids = {
  article: "a0e5ad8d-e1f2-4f56-96e5-7017238daa49",
  paragraph: "45a8e781-8381-4001-a985-54d8f1b29d03",
  other: "c769eca4-9b60-421e-916a-64e86609fb01",
};

describe("continuous-reading-core", () => {
  it("cria âncoras permanentes a partir do UUID", () => {
    expect(continuousBlockAnchor(ids.article)).toBe(`bloco-${ids.article}`);
    expect(continuousLegisBotHref("L6513MA", ids.article)).toBe(`/legisbot/L6513MA#bloco-${ids.article}`);
    expect(referenceIdFromHash(`#bloco-${ids.article}`)).toBe(ids.article);
  });

  it("preserva links antigos convertendo a ordem de quatro partes para a ordem canônica", () => {
    expect(legisBotOrderCandidates("0003.0.02.00")[0]).toBe("0003.0.02.0.00.0");
  });

  it("libera leitura quando todas as questões resolvem para blocos, sem exigir comentário", () => {
    const result = resolveContinuousReadingIntegrity({
      lawSlug: "L6513MA",
      references: [ref(ids.article, "0001.0.00.0.00.0")],
      questions: [
        { id: "q1", slug: "l6513ma", ordem: "0001.0.00.0.00.0", structureId: 114 },
        { id: "q2", slug: "l6513ma", ordem: "0001.0.00.0.00.0", structureId: 114 },
      ],
    });
    expect(result).toMatchObject({ totalQuestions: 2, linkedQuestions: 2, pendingQuestions: 0, coveragePercent: 100, readingAvailable: true, completeness: null, construction: true });
  });

  it("respeita vínculo manual diferente da ordem e não o substitui por inferência", () => {
    const result = resolveContinuousReadingIntegrity({
      lawSlug: "l6513ma",
      references: [ref(ids.article, "0001.0.00.0.00.0"), ref(ids.paragraph, "0002.0.02.0.00.0")],
      questions: [{ id: "q1", slug: "l6513ma", ordem: "0001.0.00.0.00.0", structureId: 114 }],
      manualTargets: [{ questionId: "q1", commentId: 20, slug: "L6513MA", ordem: "0002.0.02.0.00.0" }],
    });
    expect(result.resolutions[0]).toMatchObject({ status: "manual", referenceId: ids.paragraph, ordem: "0002.0.02.0.00.0" });
  });

  it("faz o link antigo respeitar o vínculo manual antes da Ordem", () => {
    const questions = [{ id: "q1", slug: "l6513ma", ordem: "0001.0.00.0.00.0", structureId: 114 }];
    const references = [ref(ids.article, "0001.0.00.0.00.0"), ref(ids.paragraph, "0002.0.02.0.00.0")];
    const integrity = resolveContinuousReadingIntegrity({
      lawSlug: "l6513ma",
      questions,
      references,
      manualTargets: [{ questionId: "q1", commentId: 20, slug: "L6513MA", ordem: "0002.0.02.0.00.0" }],
    });
    expect(resolveLegacyReferenceId({ rawOrder: "0001.0.00.00", questions, references, resolutions: integrity.resolutions })).toBe(ids.paragraph);
  });

  it("não escolhe silenciosamente quando questões da mesma Ordem divergem", () => {
    const questions = [
      { id: "q1", slug: "l6513ma", ordem: "0001.0.00.0.00.0", structureId: 114 },
      { id: "q2", slug: "l6513ma", ordem: "0001.0.00.0.00.0", structureId: 114 },
    ];
    const references = [ref(ids.article, "0001.0.00.0.00.0"), ref(ids.paragraph, "0002.0.02.0.00.0"), ref(ids.other, "0003.0.00.0.00.0")];
    const resolutions = [
      { questionId: "q1", status: "manual" as const, referenceId: ids.paragraph, ordem: "0002.0.02.0.00.0", reason: null },
      { questionId: "q2", status: "manual" as const, referenceId: ids.other, ordem: "0003.0.00.0.00.0", reason: null },
    ];
    expect(resolveLegacyReferenceId({ rawOrder: "0001.0.00.00", questions, references, resolutions })).toBeNull();
  });

  it("bloqueia liberação quando um vínculo manual está quebrado ou falta bloco", () => {
    const result = resolveContinuousReadingIntegrity({
      lawSlug: "l6513ma",
      references: [ref(ids.article, "0001.0.00.0.00.0")],
      questions: [
        { id: "q1", slug: "l6513ma", ordem: "0001.0.00.0.00.0", structureId: 114 },
        { id: "q2", slug: "l6513ma", ordem: "0002.0.00.0.00.0", structureId: 114 },
      ],
      manualTargets: [{ questionId: "q1", commentId: 21, slug: "OUTRA", ordem: "0001.0.00.0.00.0" }],
    });
    expect(result.readingAvailable).toBe(false);
    expect(result.pendingQuestions).toBe(2);
    expect(result.resolutions.map((item) => item.status)).toEqual(["invalid_manual", "missing"]);
  });

  it("não trata zero questões como cobertura completa", () => {
    const result = resolveContinuousReadingIntegrity({ lawSlug: "l6513ma", references: [ref(ids.article, "0001.0.00.0.00.0")], questions: [] });
    expect(result).toMatchObject({ coveragePercent: 0, readingAvailable: false });
  });
});
