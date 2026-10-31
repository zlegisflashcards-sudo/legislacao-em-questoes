import { validateQuestionStructure } from "./question-structure-consistency";

type Question = { id: string; slug: string; ordem: string; assunto: string | null; structure_id?: number | null };
/** Keep diagnostic and source together; never borrow a subject/link from a sibling. */
export function questionConflictProvenance(questions: Question[], lawShortName?: string | null) {
  const affected = questions.flatMap((question) => {
    const validation = validateQuestionStructure({ ...question, lawShortName });
    return validation.status === "valid" ? [] : [{
      id: question.id, assunto: question.assunto, ordem: question.ordem,
      structureId: question.structure_id ?? null, validation,
      editorUrl: `/admin/leis/${encodeURIComponent(question.slug.toLowerCase())}/questoes?question_id=${encodeURIComponent(question.id)}&retorno=${encodeURIComponent(`/admin/leis/${question.slug.toLowerCase()}/questoes?visao=conflitos`)}`,
    }];
  });
  const expected = new Set(affected.map((item) => item.validation.expectedOrder));
  return {
    affected, total: questions.length,
    hasConflict: affected.some((item) => item.validation.status === "conflict"),
    hasPossibleConflict: affected.some((item) => item.validation.status === "possible_conflict"),
    // Existing mutation operates on an entire order context, not individual IDs.
    // Mixed groups must use individual review, never silently include valid rows.
    batchEligible: affected.length > 0 && affected.length === questions.length &&
      affected.every((item) => item.validation.status === "conflict" && Boolean(item.validation.expectedOrder)) && expected.size === 1,
  };
}
