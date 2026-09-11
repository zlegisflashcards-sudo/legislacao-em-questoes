export type LegiscastStructureTreeNode = { id: number; parent_id: number | null; tipo: string; nome: string; ordem: number | null; pdf_page?: number | null };
export type LegiscastStructureTreeItem = LegiscastStructureTreeNode & { children: LegiscastStructureTreeItem[] };

const compareSiblingOrder = (left: LegiscastStructureTreeNode, right: LegiscastStructureTreeNode) => Number(left.ordem ?? 0) - Number(right.ordem ?? 0);

/** Monta o sumário por IDs estruturais em O(n), preservando nós sem áudio. */
export function buildLegiscastStructureTree(nodes: LegiscastStructureTreeNode[]): LegiscastStructureTreeItem[] {
  const items = new Map(nodes.map((node) => [node.id, { ...node, children: [] as LegiscastStructureTreeItem[] }]));
  const roots: LegiscastStructureTreeItem[] = [];
  for (const node of nodes) {
    const item = items.get(node.id)!;
    const parent = node.parent_id === null ? null : items.get(node.parent_id);
    if (parent) parent.children.push(item); else roots.push(item);
  }
  const sortSiblings = (entries: LegiscastStructureTreeItem[]) => { entries.sort(compareSiblingOrder); entries.forEach((entry) => sortSiblings(entry.children)); };
  sortSiblings(roots);
  return roots;
}
