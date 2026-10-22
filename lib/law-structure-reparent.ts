export type ReparentStructureNode = {
  id: number;
  lei_id: number;
  parent_id: number | null;
  nome: string;
  ordem: number;
  updated_at?: string | null;
};

export function structurePath(nodeId: number, nodes: ReparentStructureNode[]) {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const names: string[] = [];
  const visited = new Set<number>();
  let current = byId.get(nodeId);
  while (current) {
    if (visited.has(current.id)) throw new Error("A estrutura possui um ciclo.");
    visited.add(current.id);
    names.unshift(current.nome);
    current = current.parent_id === null ? undefined : byId.get(current.parent_id);
  }
  return names;
}

export function descendantStructureIds(rootId: number, nodes: ReparentStructureNode[]) {
  const children = new Map<number, number[]>();
  for (const node of nodes) {
    if (node.parent_id === null) continue;
    children.set(node.parent_id, [...(children.get(node.parent_id) ?? []), node.id]);
  }
  const descendants = new Set<number>();
  const visit = (id: number) => {
    for (const childId of children.get(id) ?? []) {
      if (descendants.has(childId)) continue;
      descendants.add(childId);
      visit(childId);
    }
  };
  visit(rootId);
  return descendants;
}

/** Validates a reparenting without mutating the supplied nodes. */
export function validateStructureReparenting(nodes: ReparentStructureNode[], nodeId: number, newParentId: number | null) {
  const node = nodes.find((item) => item.id === nodeId);
  if (!node) throw new Error("Estrutura ativa não encontrada.");
  if (newParentId === node.id) throw new Error("Uma estrutura não pode ser pai de si mesma.");
  const destination = newParentId === null ? null : nodes.find((item) => item.id === newParentId);
  if (newParentId !== null && !destination) throw new Error("A estrutura superior de destino não foi encontrada.");
  if (destination && destination.lei_id !== node.lei_id) throw new Error("A estrutura superior deve pertencer à mesma lei.");
  if (newParentId !== null && descendantStructureIds(node.id, nodes).has(newParentId)) throw new Error("Não é permitido mover uma estrutura para dentro de sua descendência.");
  if (node.parent_id === newParentId) throw new Error("A estrutura já está neste nível superior.");
  const siblingWithPosition = nodes.find((item) => item.id !== node.id && item.parent_id === newParentId && item.ordem === node.ordem);
  if (siblingWithPosition) throw new Error(`A posição ${node.ordem} já é usada por \"${siblingWithPosition.nome}\" no novo nível. Ajuste a posição antes de mover; a ferramenta não renumera estruturas.`);
  return { node, destination };
}
