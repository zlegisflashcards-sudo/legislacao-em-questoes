import type { QuestionStructureNode } from "@/lib/questoes-structure";

export type LawQuestionStructureGap = {
  structureId: number;
  assunto: string;
  identityKey: string;
  path: string[];
};

function pathForStructure(node: QuestionStructureNode, byId: Map<number, QuestionStructureNode>) {
  const path: string[] = [];
  const visited = new Set<number>();
  for (let current: QuestionStructureNode | undefined = node; current && !visited.has(current.id); current = current.parent_id === null ? undefined : byId.get(current.parent_id)) {
    visited.add(current.id);
    path.unshift(current.nome.trim());
  }
  return path.filter(Boolean);
}

/**
 * Uma Questão Sombra representa um bloco final da estrutura que ainda não
 * possui questão ativa. Não infere artigos ausentes pela numeração da Ordem.
 */
export function findLawQuestionStructureGaps(nodes: QuestionStructureNode[], questions: Array<{ structure_id: number | null }>): LawQuestionStructureGap[] {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const parents = new Set(nodes.flatMap((node) => node.parent_id === null ? [] : [node.parent_id]));
  const linked = new Set(questions.flatMap((question) => question.structure_id === null ? [] : [question.structure_id]));
  return nodes
    .filter((node) => !parents.has(node.id) && !linked.has(node.id))
    .map((node) => ({ structureId: node.id, assunto: node.nome.trim(), identityKey: `automatic-structure:${node.id}`, path: pathForStructure(node, byId) }));
}
