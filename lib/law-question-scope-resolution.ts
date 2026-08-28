export type ScopeStructureNode = { id: number; parent_id: number | null };
export type ScopedQuestion = { id: string; structure_id: number | null };
export type LawQuestionScope = { id: string; ativo: boolean; [key: string]: unknown };
export type LawQuestionScopeLink = { recorte_id: string; structure_id: number };
export type ScopeTreeNode<T extends ScopeStructureNode> = T & { children: ScopeTreeNode<T>[] };

export function descendantsForScope(nodes: ScopeStructureNode[], selectedIds: number[]) {
  const children = new Map<number, number[]>();
  for (const node of nodes) if (node.parent_id !== null) children.set(node.parent_id, [...(children.get(node.parent_id) ?? []), node.id]);
  const found = new Set<number>();
  const visit = (id: number) => { if (found.has(id)) return; found.add(id); for (const child of children.get(id) ?? []) visit(child); };
  for (const id of selectedIds) visit(id);
  return [...found];
}

/** Mantém todos os ancestrais fornecidos pela API; nós sem pai conhecido ficam na raiz. */
export function buildScopeTree<T extends ScopeStructureNode>(nodes: T[]) {
  const ids = new Set(nodes.map((node) => node.id));
  const children = new Map<number | null, T[]>();
  for (const node of nodes) {
    const parentId = node.parent_id !== null && ids.has(node.parent_id) ? node.parent_id : null;
    children.set(parentId, [...(children.get(parentId) ?? []), node]);
  }
  const visit = (node: T): ScopeTreeNode<T> => ({ ...node, children: (children.get(node.id) ?? []).map(visit) });
  return (children.get(null) ?? []).map(visit);
}

/** Remove escolhas redundantes: selecionar o pai já inclui todos os descendentes. */
export function normalizeScopeSelection(nodes: ScopeStructureNode[], selectedIds: number[]) {
  const selected = [...new Set(selectedIds)];
  const selectedSet = new Set(selected);
  const byId = new Map(nodes.map((node) => [node.id, node]));
  return selected.filter((id) => {
    const seen = new Set<number>();
    for (let parent = byId.get(id)?.parent_id ?? null; parent !== null && !seen.has(parent); parent = byId.get(parent)?.parent_id ?? null) {
      seen.add(parent);
      if (selectedSet.has(parent)) return false;
    }
    return true;
  });
}

export function questionsInScope<T extends ScopedQuestion>(questions: T[], structureIds: number[] | null) {
  if (structureIds === null) return questions;
  const allowed = new Set(structureIds);
  return questions.filter((question) => question.structure_id !== null && allowed.has(question.structure_id));
}

/** Combina consultas explícitas para não depender de embeds ambíguos do PostgREST. */
export function summarizeLawQuestionScopes<T extends LawQuestionScope, Q extends ScopedQuestion>(scopes: T[], links: LawQuestionScopeLink[], nodes: ScopeStructureNode[], questions: Q[]) {
  const linksByScope = new Map<string, number[]>();
  for (const link of links) linksByScope.set(link.recorte_id, [...(linksByScope.get(link.recorte_id) ?? []), link.structure_id]);
  return scopes.map((scope) => {
    const structure_ids = linksByScope.get(scope.id) ?? [];
    return { ...scope, structure_ids, question_count: questionsInScope(questions, descendantsForScope(nodes, structure_ids)).length };
  });
}
