export type LegiscastStructureTreeNode = { id: number; parent_id: number | null; tipo: string; nome: string; ordem: number | null; pdf_page?: number | null };
export type LegiscastStructureTreeItem = LegiscastStructureTreeNode & { children: LegiscastStructureTreeItem[] };

const collator = new Intl.Collator("pt-BR", { numeric: true, sensitivity: "base" });
const compare = (left: LegiscastStructureTreeNode, right: LegiscastStructureTreeNode) => Number(left.ordem ?? 0) - Number(right.ordem ?? 0) || collator.compare(left.nome, right.nome) || left.id - right.id;

/** Monta o sumário por IDs estruturais em O(n), preservando nós sem áudio. */
export function buildLegiscastStructureTree(nodes: LegiscastStructureTreeNode[]): LegiscastStructureTreeItem[] {
  const items = new Map(nodes.map((node) => [node.id, { ...node, children: [] as LegiscastStructureTreeItem[] }]));
  const roots: LegiscastStructureTreeItem[] = [];
  for (const node of nodes) {
    const item = items.get(node.id)!;
    const parent = node.parent_id === null ? null : items.get(node.parent_id);
    if (parent) parent.children.push(item); else roots.push(item);
  }
  const sort = (entries: LegiscastStructureTreeItem[]) => { entries.sort(compare); entries.forEach((entry) => sort(entry.children)); };
  sort(roots);
  return roots;
}
