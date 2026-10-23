import { describe, expect, it } from "vitest";
import {
  continuousBlockAnchor,
  continuousLegisBotHref,
  continuousLegisBotQuestionHref,
  referenceIdFromHash,
  resolveContinuousReadingIntegrity,
  resolveLegacyReferenceId,
  resolveQuestionReferenceId,
} from "./continuous-reading-core";
import { legisBotOrderCandidates } from "./order-candidates";

const questionId = "7ea93a63-951d-4f08-b90f-d3d460981a50";
const referenceId = "4bc999aa-951d-4f08-b90f-d3d460981a50";
const otherReferenceId = "5bc999aa-951d-4f08-b90f-d3d460981a50";
const question = { id: questionId, slug: "l10826", ordem: "0001.0.00.0.00.0", structureId: null };
const reference = (id = referenceId, ordem = question.ordem, prepared = true) => ({ id, slug: "l10826", ordem, identificacao: "Art. 1º", sourceQuestionId: null, prepared });
const legacyRef = (id: string, ordem: string, prepared = true) => ({ id, slug: "l6513ma", ordem, identificacao: ordem, sourceQuestionId: null, prepared });
const legacyIds = { article: "a0e5ad8d-e1f2-4f56-96e5-7017238daa49", paragraph: "45a8e781-8381-4001-a985-54d8f1b29d03", other: "c769eca4-9b60-421e-916a-64e86609fb01" };

describe("links Anki da leitura contínua", () => {
  it("preserva os utilitários e links antigos", () => {
    expect(continuousBlockAnchor(legacyIds.article)).toBe(`bloco-${legacyIds.article}`);
    expect(continuousLegisBotHref("L6513MA", legacyIds.article)).toBe(`/legisbot/L6513MA#bloco-${legacyIds.article}`);
    expect(referenceIdFromHash(`#bloco-${legacyIds.article}`)).toBe(legacyIds.article);
    expect(legisBotOrderCandidates("0003.0.02.00")[0]).toBe("0003.0.02.0.00.0");
  });

  it("mantém a cobertura e bloqueia vínculos quebrados", () => {
    const complete = resolveContinuousReadingIntegrity({ lawSlug: "l6513ma", references: [legacyRef(legacyIds.article, "0001.0.00.0.00.0")], questions: [{ id: "q1", slug: "l6513ma", ordem: "0001.0.00.0.00.0", structureId: 114 }, { id: "q2", slug: "l6513ma", ordem: "0001.0.00.0.00.0", structureId: 114 }] });
    expect(complete).toMatchObject({ totalQuestions: 2, linkedQuestions: 2, pendingQuestions: 0, coveragePercent: 100, readingAvailable: true });
    const broken = resolveContinuousReadingIntegrity({ lawSlug: "l6513ma", references: [legacyRef(legacyIds.article, "0001.0.00.0.00.0")], questions: [{ id: "q1", slug: "l6513ma", ordem: "0001.0.00.0.00.0", structureId: 114 }, { id: "q2", slug: "l6513ma", ordem: "0002.0.00.0.00.0", structureId: 114 }], manualTargets: [{ questionId: "q1", referenceId: legacyIds.other }] });
    expect(broken.resolutions.map((item) => item.status)).toEqual(["invalid_manual", "missing"]);
    expect(resolveContinuousReadingIntegrity({ lawSlug: "l6513ma", references: [legacyRef(legacyIds.article, "0001.0.00.0.00.0")], questions: [] }).readingAvailable).toBe(false);
  });

  it("preserva a resolução legada e recusa divergência por Ordem", () => {
    const questions = [{ id: "q1", slug: "l6513ma", ordem: "0001.0.00.0.00.0", structureId: 114 }];
    const references = [legacyRef(legacyIds.article, "0001.0.00.0.00.0"), legacyRef(legacyIds.paragraph, "0002.0.02.0.00.0")];
    const integrity = resolveContinuousReadingIntegrity({ lawSlug: "l6513ma", questions, references, manualTargets: [{ questionId: "q1", referenceId: legacyIds.paragraph }] });
    expect(resolveLegacyReferenceId({ rawOrder: "0001.0.00.00", questions, references, resolutions: integrity.resolutions })).toBe(legacyIds.paragraph);
    expect(resolveLegacyReferenceId({ rawOrder: "0001.0.00.00", questions: [...questions, { id: "q2", slug: "l6513ma", ordem: "0001.0.00.0.00.0", structureId: 114 }], references: [...references, legacyRef(legacyIds.other, "0003.0.00.0.00.0")], resolutions: [{ questionId: "q1", status: "manual", referenceId: legacyIds.paragraph, ordem: "0002.0.02.0.00.0", reason: null }, { questionId: "q2", status: "manual", referenceId: legacyIds.other, ordem: "0003.0.00.0.00.0", reason: null }] })).toBeNull();
  });
  it("monta URL absoluta relativa ao site com ID, slug e Ordem", () => {
    expect(continuousLegisBotQuestionHref("l10826", questionId, question.ordem)).toBe(`/legisbot/l10826?question_id=${questionId}&ordem=0001.0.00.0.00.0`);
  });

  it("prioriza vínculo manual", () => {
    const integrity = resolveContinuousReadingIntegrity({ lawSlug: "l10826", questions: [question], references: [reference(), reference(otherReferenceId)], manualTargets: [{ questionId, referenceId: otherReferenceId }] });
    expect(resolveQuestionReferenceId({ questionId, questions: [question], references: [reference(), reference(otherReferenceId)], resolutions: integrity.resolutions })).toBe(otherReferenceId);
  });

  it("mantém a identidade da questão se a Ordem do cartão foi corrigida", () => {
    const corrected = { ...question, ordem: "0002.0.00.0.00.0" };
    const integrity = resolveContinuousReadingIntegrity({ lawSlug: "l10826", questions: [corrected], references: [reference(referenceId, corrected.ordem)] });
    expect(resolveQuestionReferenceId({ questionId, questions: [corrected], references: [reference(referenceId, corrected.ordem)], resolutions: integrity.resolutions })).toBe(referenceId);
  });

  it("não escolhe âncora quando o destino está indisponível ou ambíguo", () => {
    const unavailable = resolveContinuousReadingIntegrity({ lawSlug: "l10826", questions: [question], references: [reference(referenceId, question.ordem, false)] });
    expect(resolveQuestionReferenceId({ questionId, questions: [question], references: [reference(referenceId, question.ordem, false)], resolutions: unavailable.resolutions })).toBeNull();
    const ambiguous = resolveContinuousReadingIntegrity({ lawSlug: "l10826", questions: [question], references: [reference(), reference(otherReferenceId)] });
    expect(resolveQuestionReferenceId({ questionId, questions: [question], references: [reference(), reference(otherReferenceId)], resolutions: ambiguous.resolutions })).toBeNull();
  });

  it("usa Ordem legada apenas quando não há UUID válido", () => {
    const integrity = resolveContinuousReadingIntegrity({ lawSlug: "l10826", questions: [question], references: [reference()] });
    expect(resolveLegacyReferenceId({ rawOrder: question.ordem, questions: [question], references: [reference()], resolutions: integrity.resolutions })).toBe(referenceId);
    expect(resolveQuestionReferenceId({ questionId: "invalido", questions: [question], references: [reference()], resolutions: integrity.resolutions })).toBeNull();
  });

  it("não resolve UUID de outra lei no snapshot da lei atual", () => {
    const foreignQuestionId = "6ea93a63-951d-4f08-b90f-d3d460981a50";
    const integrity = resolveContinuousReadingIntegrity({ lawSlug: "l10826", questions: [question], references: [reference()] });
    expect(resolveQuestionReferenceId({ questionId: foreignQuestionId, questions: [question], references: [reference()], resolutions: integrity.resolutions })).toBeNull();
  });
});
