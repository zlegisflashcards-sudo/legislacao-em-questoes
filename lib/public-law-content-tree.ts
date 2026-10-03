import { buildLegiscastStructureTree, type LegiscastStructureTreeItem } from "@/lib/legiscast-structure-tree";

export type PublicLawContentStructureNode = {
  id: number;
  parent_id: number | null;
  tipo: string;
  nome: string;
  ordem: number | null;
  audio_not_applicable?: boolean;
};

export type PublicLawContentQuestion = { structure_id: number | null };
export type PublicLawContentAudio = { structure_id: number | null };

export type PublicLawContentTreeNode = PublicLawContentStructureNode & {
  questionCount: number;
  hasOwnLegiscast: boolean;
  audioNotApplicable: boolean;
  hasLegiscast: boolean;
  children: PublicLawContentTreeNode[];
};

function authorizedStructureIds(nodes: PublicLawContentStructureNode[], scopeStructureIds: number[] | null) {
  if (scopeStructureIds === null) return new Set(nodes.map((node) => node.id));

  const children = new Map<number, number[]>();
  for (const node of nodes) {
    if (node.parent_id !== null) children.set(node.parent_id, [...(children.get(node.parent_id) ?? []), node.id]);
  }

  const authorized = new Set<number>();
  const includeDescendants = (id: number) => {
    if (authorized.has(id)) return;
    authorized.add(id);
    for (const childId of children.get(id) ?? []) includeDescendants(childId);
  };
  for (const id of scopeStructureIds) includeDescendants(id);
  return authorized;
}

function visibleStructureIds(nodes: PublicLawContentStructureNode[], authorizedIds: Set<number>) {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const visible = new Set(authorizedIds);
  for (const id of authorizedIds) {
    const visited = new Set<number>();
    for (let parentId = byId.get(id)?.parent_id ?? null; parentId !== null && !visited.has(parentId); parentId = byId.get(parentId)?.parent_id ?? null) {
      visited.add(parentId);
      visible.add(parentId);
    }
  }
  return visible;
}

/**
 * Projeção efêmera do conteúdo efetivamente produzido. Em um recorte, os
 * ancestrais são exibidos só para a hierarquia; os indicadores consideram
 * exclusivamente nós autorizados, inclusive seus descendentes.
 */
export function buildPublicLawContentTree({
  structure,
  questions,
  audios,
  scopeStructureIds = null,
}: {
  structure: PublicLawContentStructureNode[];
  questions: PublicLawContentQuestion[];
  audios: PublicLawContentAudio[];
  scopeStructureIds?: number[] | null;
}): PublicLawContentTreeNode[] {
  const knownIds = new Set(structure.map((node) => node.id));
  const authorizedIds = authorizedStructureIds(structure, scopeStructureIds);
  for (const id of [...authorizedIds]) if (!knownIds.has(id)) authorizedIds.delete(id);
  const visibleIds = visibleStructureIds(structure, authorizedIds);
  const visibleStructure = structure.filter((node) => visibleIds.has(node.id));
  const notApplicableIds = new Set(visibleStructure.filter((node) => node.audio_not_applicable === true).map((node) => node.id));
  const questionCounts = new Map<number, number>();
  const audioIds = new Set<number>();

  for (const question of questions) {
    if (question.structure_id !== null && authorizedIds.has(question.structure_id)) {
      questionCounts.set(question.structure_id, (questionCounts.get(question.structure_id) ?? 0) + 1);
    }
  }
  for (const audio of audios) {
    if (audio.structure_id !== null && authorizedIds.has(audio.structure_id)) audioIds.add(audio.structure_id);
  }

  const project = (node: LegiscastStructureTreeItem): PublicLawContentTreeNode => {
    const children = node.children.map(project);
    return {
      id: node.id,
      parent_id: node.parent_id,
      tipo: node.tipo,
      nome: node.nome,
      ordem: node.ordem,
      hasOwnLegiscast: audioIds.has(node.id),
      audioNotApplicable: notApplicableIds.has(node.id),
      questionCount: (questionCounts.get(node.id) ?? 0) + children.reduce((total, child) => total + child.questionCount, 0),
      hasLegiscast: audioIds.has(node.id) || notApplicableIds.has(node.id) || children.some((child) => child.hasLegiscast),
      children,
    };
  };

  return buildLegiscastStructureTree(visibleStructure).map(project);
}
