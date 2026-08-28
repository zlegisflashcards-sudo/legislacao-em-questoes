export type ScopeStructureNode = { id: number; parent_id: number | null };
export type ScopedQuestion = { id: string; structure_id: number | null };

export function descendantsForScope(nodes: ScopeStructureNode[], selectedIds: number[]) {
  const children = new Map<number, number[]>();
  for (const node of nodes) if (node.parent_id !== null) children.set(node.parent_id, [...(children.get(node.parent_id) ?? []), node.id]);
  const found = new Set<number>();
  const visit = (id: number) => { if (found.has(id)) return; found.add(id); for (const child of children.get(id) ?? []) visit(child); };
  for (const id of selectedIds) visit(id);
  return [...found];
}

export function questionsInScope<T extends ScopedQuestion>(questions: T[], structureIds: number[] | null) {
  if (structureIds === null) return questions;
  const allowed = new Set(structureIds);
  return questions.filter((question) => question.structure_id !== null && allowed.has(question.structure_id));
}
