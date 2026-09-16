type StructureNode = { id: number; parent_id: number | null };

export type AdminQuestionAnswerFilter = "all" | "certo" | "errado";

export function descendantStructureIds(nodes: StructureNode[], rootId: number | null) {
  if (rootId === null) return [];
  const children = new Map<number, number[]>();
  for (const node of nodes) if (node.parent_id !== null) children.set(node.parent_id, [...(children.get(node.parent_id) ?? []), node.id]);
  const result: number[] = [];
  const visit = (current: number) => { if (result.includes(current)) return; result.push(current); for (const child of children.get(current) ?? []) visit(child); };
  visit(rootId);
  return result;
}

export function wouldCreateStructureCycle(nodes: StructureNode[], sourceId: number, destinationId: number | null) {
  return destinationId !== null && descendantStructureIds(nodes, sourceId).includes(destinationId);
}

export function questionResultNeighbor(ids: string[], currentId: string, direction: -1 | 1) {
  const index = ids.indexOf(currentId);
  if (index < 0) return null;
  return ids[index + direction] ?? null;
}

export function sameImportIdentity(a: { ordem: string; pergunta: string }, b: { ordem: string; pergunta: string }) {
  return a.ordem.trim() === b.ordem.trim() && a.pergunta.trim() === b.pergunta.trim();
}
