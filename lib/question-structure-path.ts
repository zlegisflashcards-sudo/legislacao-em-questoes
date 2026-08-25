export type QuestionStructurePathNode = {
  id: number;
  parent_id: number | null;
  tipo?: "titulo" | "capitulo" | "secao" | "subsecao";
  nome: string;
};

/** Reconstroi o caminho canônico de uma questão sem inferir níveis pela ordem. */
export function questionStructurePath(nodes: QuestionStructurePathNode[], structureId: number | null | undefined) {
  if (!Number.isSafeInteger(structureId) || !structureId || structureId < 1) return [];
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const path: QuestionStructurePathNode[] = [];
  const visited = new Set<number>();
  for (let current = byId.get(structureId); current && !visited.has(current.id); current = current.parent_id === null ? undefined : byId.get(current.parent_id)) {
    visited.add(current.id);
    path.unshift(current);
  }
  return path;
}

export function legacyQuestionStructurePath(question: { capitulo?: string | null; secao?: string | null; subsecao?: string | null }) {
  return [question.capitulo, question.secao, question.subsecao].flatMap((nome, index) => typeof nome === "string" && nome.trim() ? [{ id: -(index + 1), parent_id: null, nome: nome.trim() }] : []);
}
