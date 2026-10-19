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

export type ManualReferenceTarget = {
  questionId: string;
  referenceId: string;
};

export type QuestionReferenceResolution = {
  questionId: string;
  status: "manual" | "hierarchy" | "missing" | "ambiguous" | "invalid_manual" | "invalid_order";
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
  manualTargets?: ManualReferenceTarget[];
}): ReadingIntegrity {
  const lawSlug = input.lawSlug.trim().toLowerCase();
  const references = input.references.filter((reference) => reference.slug.trim().toLowerCase() === lawSlug);
  const referencesByOrder = new Map<string, ContinuousReferenceSummary[]>();
  for (const reference of references) referencesByOrder.set(reference.ordem, [...(referencesByOrder.get(reference.ordem) ?? []), reference]);
  const manualByQuestion = new Map((input.manualTargets ?? []).map((target) => [target.questionId, target]));

  const resolutions = input.questions.map<QuestionReferenceResolution>((question) => {
    const manual = manualByQuestion.get(question.id);
    if (manual) {
      const reference = references.find((candidate) => candidate.id === manual.referenceId && candidate.prepared);
      if (!reference) return { questionId: question.id, status: "invalid_manual", referenceId: null, ordem: null, reason: "O vínculo manual aponta para um bloco legislativo inexistente ou não preparado nesta legislação." };
      return { questionId: question.id, status: "manual", referenceId: reference.id, ordem: reference.ordem, reason: null };
    }

    if (question.slug.trim().toLowerCase() !== lawSlug || !VALID_ORDER.test(question.ordem.trim())) {
      return { questionId: question.id, status: "invalid_order", referenceId: null, ordem: question.ordem, reason: "A questão não possui uma ordem estrutural válida para esta legislação." };
    }
    for (const ordem of legisBotOrderCandidates(question.ordem.trim())) {
      const candidates = (referencesByOrder.get(ordem) ?? []).filter((reference) => reference.prepared);
      if (candidates.length > 1) return { questionId: question.id, status: "ambiguous", referenceId: null, ordem, reason: "Mais de um bloco legislativo pode representar esta questão." };
      if (candidates.length === 1) return { questionId: question.id, status: "hierarchy", referenceId: candidates[0].id, ordem: candidates[0].ordem, reason: null };
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

/**
 * Compatibilidade dos endereços antigos /legisbot/[slug]/[ordem]. Se houver
 * questão nessa Ordem, a resolução editorial da questão vence a inferência pela
 * própria Ordem. Destinos ausentes ou divergentes nunca são escolhidos por acaso.
 */
export function resolveLegacyReferenceId(input: {
  rawOrder: string;
  questions: ContinuousQuestion[];
  references: ContinuousReferenceSummary[];
  resolutions: QuestionReferenceResolution[];
}) {
  const canonicalOrder = legisBotOrderCandidates(input.rawOrder.trim())[0];
  const matchingQuestions = input.questions.filter((question) => legisBotOrderCandidates(question.ordem.trim())[0] === canonicalOrder);
  if (matchingQuestions.length) {
    const byQuestion = new Map(input.resolutions.map((resolution) => [resolution.questionId, resolution]));
    const resolved = matchingQuestions.map((question) => byQuestion.get(question.id));
    if (resolved.some((resolution) => !resolution?.referenceId)) return null;
    const referenceIds = new Set(resolved.map((resolution) => resolution!.referenceId!));
    return referenceIds.size === 1 ? [...referenceIds][0] : null;
  }

  for (const order of legisBotOrderCandidates(input.rawOrder.trim())) {
    const candidates = input.references.filter((reference) => reference.ordem === order && reference.prepared);
    if (candidates.length > 1) return null;
    if (candidates.length === 1) return candidates[0].id;
  }
  return null;
}
