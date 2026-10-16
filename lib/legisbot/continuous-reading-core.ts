import { legisBotOrderCandidates } from "./order-candidates";

export type ContinuousReferenceSummary = {
  id: string;
  slug: string;
  ordem: string;
  identificacao: string;
  sourceQuestionId: string | null;
  prepared: boolean;
};

export type ContinuousQuestion = {
  id: string;
  slug: string;
  ordem: string;
  structureId: number | null;
};

export type ManualCommentTarget = {
  questionId: string;
  commentId: number;
  slug: string | null;
  ordem: string | null;
};

export type QuestionReferenceResolution = {
  questionId: string;
  status: "manual" | "hierarchy" | "missing" | "invalid_manual" | "invalid_order";
  referenceId: string | null;
  ordem: string | null;
  reason: string | null;
};

export type ReadingIntegrity = {
  totalQuestions: number;
  linkedQuestions: number;
  pendingQuestions: number;
  coveragePercent: number;
  availableBlocks: number;
  readingAvailable: boolean;
  construction: boolean;
  completeness: null;
  resolutions: QuestionReferenceResolution[];
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const VALID_ORDER = /^\d{1,6}\.[0-9a-z]+\.\d{1,4}\.[0-9a-z]+\.\d{1,4}\.[0-9a-z]+$/i;

export function continuousBlockAnchor(referenceId: string) {
  if (!UUID.test(referenceId)) throw new Error("Identificador de referência inválido.");
  return `bloco-${referenceId.toLowerCase()}`;
}

export function continuousLegisBotHref(slug: string, referenceId: string) {
  return `/legisbot/${encodeURIComponent(slug.trim())}#${continuousBlockAnchor(referenceId)}`;
}

export function referenceIdFromHash(hash: string) {
  const value = hash.replace(/^#/, "").replace(/^bloco-/, "");
  return UUID.test(value) ? value.toLowerCase() : null;
}

/**
 * Resolve cobertura sem depender da existência de comentário concluído.
 * O vínculo manual sempre vence; uma referência automática só é aceita quando
 * a ordem possui formato estrutural e existe um único destino canônico preparado.
 */
export function resolveContinuousReadingIntegrity(input: {
  lawSlug: string;
  questions: ContinuousQuestion[];
  references: ContinuousReferenceSummary[];
  manualTargets?: ManualCommentTarget[];
}): ReadingIntegrity {
  const lawSlug = input.lawSlug.trim().toLowerCase();
  const references = input.references.filter((reference) => reference.slug.trim().toLowerCase() === lawSlug);
  const referenceByOrder = new Map(references.map((reference) => [reference.ordem, reference]));
  const manualByQuestion = new Map((input.manualTargets ?? []).map((target) => [target.questionId, target]));

  const resolutions = input.questions.map<QuestionReferenceResolution>((question) => {
    const manual = manualByQuestion.get(question.id);
    if (manual) {
      if (!manual.slug || !manual.ordem || manual.slug.trim().toLowerCase() !== lawSlug) {
        return { questionId: question.id, status: "invalid_manual", referenceId: null, ordem: manual.ordem, reason: "O vínculo manual aponta para outra legislação ou para um destino inexistente." };
      }
      const reference = referenceByOrder.get(manual.ordem);
      if (!reference?.prepared) {
        return { questionId: question.id, status: "invalid_manual", referenceId: reference?.id ?? null, ordem: manual.ordem, reason: "O bloco definido manualmente não possui texto legislativo preparado." };
      }
      return { questionId: question.id, status: "manual", referenceId: reference.id, ordem: reference.ordem, reason: null };
    }

    if (question.slug.trim().toLowerCase() !== lawSlug || !VALID_ORDER.test(question.ordem.trim())) {
      return { questionId: question.id, status: "invalid_order", referenceId: null, ordem: question.ordem, reason: "A questão não possui uma ordem estrutural válida para esta legislação." };
    }
    for (const ordem of legisBotOrderCandidates(question.ordem.trim())) {
      const reference = referenceByOrder.get(ordem);
      if (reference?.prepared) {
        return { questionId: question.id, status: "hierarchy", referenceId: reference.id, ordem: reference.ordem, reason: null };
      }
    }
    return { questionId: question.id, status: "missing", referenceId: null, ordem: null, reason: "Nenhum bloco legislativo preparado foi encontrado na cadeia estrutural da questão." };
  });

  const linkedQuestions = resolutions.filter((resolution) => resolution.referenceId !== null && (resolution.status === "manual" || resolution.status === "hierarchy")).length;
  const totalQuestions = input.questions.length;
  const pendingQuestions = totalQuestions - linkedQuestions;
  return {
    totalQuestions,
    linkedQuestions,
    pendingQuestions,
    coveragePercent: totalQuestions ? Math.round((linkedQuestions / totalQuestions) * 10_000) / 100 : 0,
    availableBlocks: references.filter((reference) => reference.prepared).length,
    readingAvailable: totalQuestions > 0 && pendingQuestions === 0,
    construction: true,
    completeness: null,
    resolutions,
  };
}
