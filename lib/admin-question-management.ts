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

/**
 * A questão é escrita no editor rico. Para a prevenção de duplicidade, a
 * formatação visual não deve permitir cadastrar novamente o mesmo enunciado.
 */
export function normalizedQuestionStatement(value: unknown) {
  return String(value ?? "")
    .replace(/<br\s*\/?\s*>/gi, "\n")
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .normalize("NFC")
    .replace(/\s+/g, " ")
    .trim()
    .toLocaleLowerCase("pt-BR");
}

export function sameStructureQuestionStatement(a: { pergunta: string }, b: { pergunta: string }) {
  return normalizedQuestionStatement(a.pergunta) === normalizedQuestionStatement(b.pergunta);
}

export type DuplicateQuestionStatement<T extends { id: string; lei_id: number; pergunta: string }> = {
  normalizedStatement: string;
  questions: T[];
};

/**
 * Duplicidade editorial é a assertiva inteira na mesma lei. Assunto, ordem e
 * estrutura apenas localizam a questão: eles não fazem parte da identidade.
 */
export function groupDuplicateQuestionStatements<T extends { id: string; lei_id: number; pergunta: string }>(questions: T[]): DuplicateQuestionStatement<T>[] {
  const groups = new Map<string, T[]>();
  for (const question of questions) {
    const normalizedStatement = normalizedQuestionStatement(question.pergunta);
    if (!normalizedStatement) continue;
    const key = `${question.lei_id}\u0000${normalizedStatement}`;
    groups.set(key, [...(groups.get(key) ?? []), question]);
  }
  return [...groups.entries()]
    .filter(([, entries]) => entries.length > 1)
    .map(([key, entries]) => ({ normalizedStatement: key.slice(key.indexOf("\u0000") + 1), questions: [...entries].sort((left, right) => left.id.localeCompare(right.id)) }));
}
