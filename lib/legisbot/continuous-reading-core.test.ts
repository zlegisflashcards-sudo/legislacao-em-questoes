import { describe, expect, it } from "vitest";
import { continuousBlockAnchor, continuousLegisBotHref, referenceIdFromHash, resolveContinuousReadingIntegrity } from "./continuous-reading-core";
import { legisBotOrderCandidates } from "./order-candidates";

const ref = (id: string, ordem: string, prepared = true) => ({ id, slug: "l6513ma", ordem, identificacao: ordem, sourceQuestionId: null, prepared });
const ids = {
  article: "a0e5ad8d-e1f2-4f56-96e5-7017238daa49",
  paragraph: "45a8e781-8381-4001-a985-54d8f1b29d03",
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
