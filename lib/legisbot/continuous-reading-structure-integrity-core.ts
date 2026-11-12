import type { QuestionReferenceResolution } from "./continuous-reading-core";
import { continuousReadingStructureDescendantIds, continuousReadingStructurePath, type ContinuousReadingReferenceStructureAssociation, type ContinuousReadingStructureNode } from "./continuous-reading-structure-core";

export type StructureIntegrityStatus = "ready" | "pending_blocks" | "orphan_questions" | "ambiguous" | "empty";
export type StructureIntegrityReason =
  | "inventory_unavailable"
  | "inventory_unattributed"
  | "reference_unattributed"
  | "reference_unprepared"
  | "reference_unassociated"
  | "reference_ambiguous"
  | "orphan_question"
  | "orphan_question_unattributed"
  | "question_structure_mismatch"
  | "descendant_empty";

export type StructureIntegrityReference = {
  id: string;
  ordem: string;
  prepared: boolean;
};

export type StructureIntegrityQuestion = {
  id: string;
  structureId: number | null;
};

export type StructureIntegrityInventoryItem = { ordem: string };

export type ContinuousReadingStructureIntegrity = {
  structureId: number;
  name: string;
  path: string[];
  descendantStructureIds: number[];
  activeQuestionCount: number;
  preparedReferenceCount: number;
  orphanQuestionCount: number;
  pendingAssociationCount: number;
  status: StructureIntegrityStatus;
  reasons: StructureIntegrityReason[];
};

export type ContinuousReadingLawStructureIntegrity = {
  hasStructures: boolean;
  reports: ContinuousReadingStructureIntegrity[];
  unassigned: {
    orphanQuestionIds: string[];
    referenceIds: string[];
    inventoryOrders: string[];
  };
};

const unresolved = new Set<QuestionReferenceResolution["status"]>(["missing", "ambiguous", "invalid_manual", "invalid_order"]);
const unique = <T,>(items: T[]) => [...new Set(items)];

function associationScope(association: ContinuousReadingReferenceStructureAssociation) {
  if (association.status === "editorial") return association.structureId === null ? [] : [association.structureId];
  return association.candidateStructureIds;
}

function summaryStatus(reasons: StructureIntegrityReason[], hasElements: boolean): StructureIntegrityStatus {
  if (!hasElements) return "empty";
  if (reasons.some((reason) => reason === "orphan_question" || reason === "orphan_question_unattributed")) return "orphan_questions";
  if (reasons.some((reason) => reason === "reference_ambiguous" || reason === "question_structure_mismatch")) return "ambiguous";
  if (reasons.length) return "pending_blocks";
  return "ready";
}

/**
 * Diagnóstico puro. Não concede liberação: quando a origem não permite provar
 * o recorte, a pendência fica sem atribuição e impede todos os recortes
 * potencialmente afetados de se tornarem "ready".
 */
export function resolveContinuousReadingStructureIntegrity(input: {
  structures: readonly ContinuousReadingStructureNode[];
  questions: readonly StructureIntegrityQuestion[];
  references: readonly StructureIntegrityReference[];
  resolutions: readonly QuestionReferenceResolution[];
  associations: readonly ContinuousReadingReferenceStructureAssociation[];
  inventoryAvailable: boolean;
  inventory: readonly StructureIntegrityInventoryItem[];
}): ContinuousReadingLawStructureIntegrity {
  if (!input.structures.length) {
    return { hasStructures: false, reports: [], unassigned: { orphanQuestionIds: [], referenceIds: [], inventoryOrders: [] } };
  }
  const knownStructureIds = new Set(input.structures.map((node) => node.id));
  const associationByReference = new Map(input.associations.map((association) => [association.referenceId, association]));
  const referenceById = new Map(input.references.map((reference) => [reference.id, reference]));
  const resolutionByQuestion = new Map(input.resolutions.map((resolution) => [resolution.questionId, resolution]));
  const referenceStructureIds = new Map<string, number[]>();
  const unassignedReferenceIds: string[] = [];

  for (const reference of input.references) {
    const scopes = (associationScope(associationByReference.get(reference.id) ?? {
      referenceId: reference.id, structureId: null, status: "unassociated", candidateStructureIds: [], suggestionStatus: "unassociated", suggestedStructureId: null,
    })).filter((id) => knownStructureIds.has(id));
    if (scopes.length) referenceStructureIds.set(reference.id, unique(scopes));
    else unassignedReferenceIds.push(reference.id);
  }

  const inventoryByOrder = new Map(input.references.map((reference) => [reference.ordem.trim(), reference.id]));
  const unassignedInventoryOrders = input.inventory
    .map((item) => item.ordem.trim())
    .filter((ordem) => !inventoryByOrder.get(ordem) || !(referenceStructureIds.get(inventoryByOrder.get(ordem)!)?.length));

  const hasDirectElement = (structureId: number) => {
    if (input.questions.some((question) => (questionStructureIds.get(question.id) ?? []).includes(structureId))) return true;
    if (input.references.some((reference) => (referenceStructureIds.get(reference.id) ?? []).includes(structureId))) return true;
    return false;
  };

  const questionStructureIds = new Map<string, number[]>();
  const unassignedOrphanQuestionIds: string[] = [];
  for (const question of input.questions) {
    const resolution = resolutionByQuestion.get(question.id);
    const resolvedReferenceScopes = resolution?.referenceId ? referenceStructureIds.get(resolution.referenceId) ?? [] : [];
    const direct = question.structureId !== null && knownStructureIds.has(question.structureId) ? [question.structureId] : [];
    const scopes = unique([...direct, ...resolvedReferenceScopes]);
    if (scopes.length) questionStructureIds.set(question.id, scopes);
    if (resolution && unresolved.has(resolution.status) && !scopes.length) unassignedOrphanQuestionIds.push(question.id);
  }

  const reports = input.structures.map((structure) => {
    const descendants = continuousReadingStructureDescendantIds(structure.id, input.structures);
    const scope = new Set(descendants);
    const questionIds = input.questions.filter((question) => (questionStructureIds.get(question.id) ?? []).some((id) => scope.has(id))).map((question) => question.id);
    const referenceIds = input.references.filter((reference) => (referenceStructureIds.get(reference.id) ?? []).some((id) => scope.has(id))).map((reference) => reference.id);
    const reasons: StructureIntegrityReason[] = [];
    const orphanQuestionCount = questionIds.filter((id) => {
      const resolution = resolutionByQuestion.get(id);
      return Boolean(resolution && unresolved.has(resolution.status));
    }).length;
    if (orphanQuestionCount) reasons.push("orphan_question");
    const mismatch = questionIds.some((id) => {
      const question = input.questions.find((item) => item.id === id);
      const resolution = resolutionByQuestion.get(id);
      const targetScopes = resolution?.referenceId ? referenceStructureIds.get(resolution.referenceId) ?? [] : [];
      return Boolean(question?.structureId && targetScopes.length && !targetScopes.includes(question.structureId));
    });
    if (mismatch) reasons.push("question_structure_mismatch");
    const associations = referenceIds.map((id) => associationByReference.get(id)).filter((item): item is ContinuousReadingReferenceStructureAssociation => Boolean(item));
    if (associations.some((item) => item.status === "unassociated" || item.status === "associated")) reasons.push("reference_unassociated");
    if (associations.some((item) => item.status === "ambiguous")) reasons.push("reference_ambiguous");
    if (referenceIds.some((id) => !referenceById.get(id)?.prepared)) reasons.push("reference_unprepared");
    if (!input.inventoryAvailable) reasons.push("inventory_unavailable");
    if (unassignedReferenceIds.length) reasons.push("reference_unattributed");
    if (unassignedInventoryOrders.length) reasons.push("inventory_unattributed");
    if (unassignedOrphanQuestionIds.length) reasons.push("orphan_question_unattributed");
    // A estrutura superior só fica pronta se todos os seus ramos também têm
    // evidência suficiente; um ramo vazio não é convertido em cobertura.
    if (descendants.some((id) => id !== structure.id && !hasDirectElement(id))) reasons.push("descendant_empty");
    const hasElements = questionIds.length > 0 || referenceIds.length > 0 || input.inventory.some((item) => {
      const referenceId = inventoryByOrder.get(item.ordem.trim());
      return referenceId ? referenceIds.includes(referenceId) : false;
    });
    const path = continuousReadingStructurePath(structure.id, input.structures).map((item) => (item as ContinuousReadingStructureNode & { nome?: string }).nome ?? String(item.id));
    return {
      structureId: structure.id,
      name: (structure as ContinuousReadingStructureNode & { nome?: string }).nome ?? String(structure.id),
      path,
      descendantStructureIds: descendants,
      activeQuestionCount: questionIds.length,
      preparedReferenceCount: referenceIds.filter((id) => Boolean(referenceById.get(id)?.prepared)).length,
      orphanQuestionCount,
      pendingAssociationCount: associations.filter((item) => item.status !== "editorial").length,
      status: summaryStatus(unique(reasons), hasElements),
      reasons: unique(reasons),
    };
  });

  return {
    hasStructures: true,
    reports,
    unassigned: { orphanQuestionIds: unique(unassignedOrphanQuestionIds), referenceIds: unique(unassignedReferenceIds), inventoryOrders: unique(unassignedInventoryOrders) },
  };
}
