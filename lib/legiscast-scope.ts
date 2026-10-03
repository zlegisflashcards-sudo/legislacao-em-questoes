export type LegiscastScopeNode = { id: number; parent_id: number | null };
export type LegiscastScopedAudio = { structure_id: number | null };

/**
 * Mantém os nós pertencentes ao recorte e somente os ancestrais necessários
 * para preservar a hierarquia visual original. `null` representa lei completa.
 */
export function structureForLegiscastScope<T extends LegiscastScopeNode>(nodes: T[], structureIds: number[] | null) {
  if (structureIds === null) return nodes;
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const visible = new Set(structureIds);
  for (const id of structureIds) {
    const visited = new Set<number>();
    for (let parentId = byId.get(id)?.parent_id ?? null; parentId !== null && !visited.has(parentId); parentId = byId.get(parentId)?.parent_id ?? null) {
      visited.add(parentId);
      visible.add(parentId);
    }
  }
  return nodes.filter((node) => visible.has(node.id));
}

export function audiosForLegiscastScope<T extends LegiscastScopedAudio>(audios: T[], structureIds: number[] | null) {
  if (structureIds === null) return audios;
  const allowed = new Set(structureIds);
  return audios.filter((audio) => audio.structure_id !== null && allowed.has(audio.structure_id));
}
