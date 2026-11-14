export type ContinuousReadingStructureNode = {
  id: number;
  parentId: number | null;
  ordem: number;
};

export type ContinuousReadingStructureQuestion = {
  id: string;
  structureId: number | null;
};

export type ContinuousReadingStructureReference = {
  id: string;
  sourceQuestionId: string | null;
  /** Vínculo confirmado pelo administrador; quando presente, vence a inferência. */
  structureId?: number | null;
};

export type ContinuousReadingReferenceResolution = {
  questionId: string;
  referenceId: string | null;
};

export type ContinuousReadingReferenceStructureAssociation = {
  referenceId: string;
  structureId: number | null;
  status: "editorial" | "associated" | "unassociated" | "ambiguous";
  candidateStructureIds: number[];
  suggestionStatus: "associated" | "unassociated" | "ambiguous";
  suggestedStructureId: number | null;
};

/** A lei sem nós editoriais continua sendo uma leitura única e completa. */
export function hasContinuousReadingStructures(structures: readonly ContinuousReadingStructureNode[]) {
  return structures.length > 0;
}

/** Retorna o caminho raiz → nó e nunca entra em ciclo, mesmo diante de dados legados. */
export function continuousReadingStructurePath<T extends ContinuousReadingStructureNode>(structureId: number | null, structures: readonly T[]) {
  if (!structureId) return [] as T[];
  const byId = new Map(structures.map((node) => [node.id, node]));
  const path: T[] = [];
  const visited = new Set<number>();
  for (let node = byId.get(structureId); node && !visited.has(node.id); node = node.parentId ? byId.get(node.parentId) : undefined) {
    visited.add(node.id);
    path.unshift(node);
  }
  return path;
}

/** Inclui o próprio nó e todos os seus descendentes, em ordem editorial. */
export function continuousReadingStructureDescendantIds(structureId: number, structures: readonly ContinuousReadingStructureNode[]) {
  const children = new Map<number | null, ContinuousReadingStructureNode[]>();
  for (const node of structures) children.set(node.parentId, [...(children.get(node.parentId) ?? []), node]);
  const result: number[] = [];
  const visit = (id: number) => {
    result.push(id);
    for (const child of (children.get(id) ?? []).slice().sort((left, right) => left.ordem - right.ordem || left.id - right.id)) visit(child.id);
  };
  if (structures.some((node) => node.id === structureId)) visit(structureId);
  return result;
}

/**
 * Produz uma lista plana na mesma ordem em que a árvore aparece no sumário:
 * cada pai vem antes dos seus filhos, e irmãos seguem `ordem`/`id`.
 * Nós legados sem pai válido também continuam visíveis ao final, em ordem
 * estável, para que a administração possa corrigi-los sem perder acesso.
 */
export function orderContinuousReadingStructures<T extends ContinuousReadingStructureNode>(structures: readonly T[]) {
  const byId = new Map(structures.map((node) => [node.id, node]));
  const children = new Map<number | null, T[]>();
  for (const node of structures) children.set(node.parentId, [...(children.get(node.parentId) ?? []), node]);
  const compare = (left: T, right: T) => left.ordem - right.ordem || left.id - right.id;
  const ordered: T[] = [];
  const visited = new Set<number>();
  const visit = (node: T) => {
    if (visited.has(node.id)) return;
    visited.add(node.id);
    ordered.push(node);
    for (const child of (children.get(node.id) ?? []).slice().sort(compare)) visit(child);
  };
  for (const root of structures.filter((node) => node.parentId === null || !byId.has(node.parentId)).slice().sort(compare)) visit(root);
  for (const node of structures.slice().sort(compare)) visit(node);
  return ordered;
}

/**
 * Não elege a primeira questão como dona da estrutura de um bloco.
 * O vínculo só é seguro quando todas as evidências estruturais apontam para
 * o mesmo nó. A ausência ou divergência permanece explícita para revisão.
 */
export function resolveContinuousReadingReferenceStructureAssociations(input: {
  references: readonly ContinuousReadingStructureReference[];
  questions: readonly ContinuousReadingStructureQuestion[];
  resolutions: readonly ContinuousReadingReferenceResolution[];
  structures: readonly ContinuousReadingStructureNode[];
}): ContinuousReadingReferenceStructureAssociation[] {
  const structureIds = new Set(input.structures.map((structure) => structure.id));
  const questionById = new Map(input.questions.map((question) => [question.id, question]));
  const resolutionByReference = new Map<string, string[]>();
  for (const resolution of input.resolutions) {
    if (!resolution.referenceId) continue;
    resolutionByReference.set(resolution.referenceId, [...(resolutionByReference.get(resolution.referenceId) ?? []), resolution.questionId]);
  }

  return input.references.map((reference) => {
    const candidates = new Set<number>();
    const source = reference.sourceQuestionId ? questionById.get(reference.sourceQuestionId) : undefined;
    if (source?.structureId && structureIds.has(source.structureId)) candidates.add(source.structureId);
    for (const questionId of resolutionByReference.get(reference.id) ?? []) {
      const structureId = questionById.get(questionId)?.structureId;
      if (structureId && structureIds.has(structureId)) candidates.add(structureId);
    }
    const candidateStructureIds = [...candidates].sort((left, right) => left - right);
    const suggestionStatus = candidateStructureIds.length === 1 ? "associated" : candidateStructureIds.length > 1 ? "ambiguous" : "unassociated";
    const suggestedStructureId = suggestionStatus === "associated" ? candidateStructureIds[0] : null;
    const editorialStructureId = reference.structureId && structureIds.has(reference.structureId) ? reference.structureId : null;
    if (editorialStructureId !== null) return { referenceId: reference.id, structureId: editorialStructureId, status: "editorial", candidateStructureIds, suggestionStatus, suggestedStructureId };
    return { referenceId: reference.id, structureId: suggestedStructureId, status: suggestionStatus, candidateStructureIds, suggestionStatus, suggestedStructureId };
  });
}

/** Seleciona somente blocos com associação estrutural segura dentro do recorte. */
export function continuousReadingReferenceIdsForStructureScope(
  structureId: number,
  structures: readonly ContinuousReadingStructureNode[],
  associations: readonly ContinuousReadingReferenceStructureAssociation[],
) {
  const allowedStructureIds = new Set(continuousReadingStructureDescendantIds(structureId, structures));
  return associations
    .filter((association) => (association.status === "associated" || association.status === "editorial") && association.structureId !== null && allowedStructureIds.has(association.structureId))
    .map((association) => association.referenceId);
}

/** Ordem é canônica e preenchida; em valores legados, preserva a estabilidade por ID. */
export function orderContinuousReadingReferences<T extends { id: string; ordem: string }>(references: readonly T[]) {
  return [...references].sort((left, right) => left.ordem.localeCompare(right.ordem, "pt-BR", { numeric: true }) || left.id.localeCompare(right.id));
}
