export type BlockQuestion = { id: string; structureId: number | null; createdAt: string };
export type BlockStructure = { id: number; parentId: number | null };
export type StudentAnswer = { questionId: string; answeredAt: string };

/**
 * Uma questão é nova para o aluno somente quando entrou após a primeira
 * resposta dele naquele ramo da estrutura e ainda não foi respondida.
 */
export function newQuestionCountsByStructure(structure: BlockStructure[], questions: BlockQuestion[], answers: StudentAnswer[]) {
  const children = new Map<number, number[]>();
  for (const node of structure) if (node.parentId !== null) children.set(node.parentId, [...(children.get(node.parentId) ?? []), node.id]);
  const descendantIds = (id: number): number[] => [id, ...(children.get(id) ?? []).flatMap(descendantIds)];
  const answeredAt = new Map<string, string>();
  for (const answer of answers) if (!answeredAt.has(answer.questionId) || answer.answeredAt < answeredAt.get(answer.questionId)!) answeredAt.set(answer.questionId, answer.answeredAt);
  const result = new Map<number, number>();
  for (const node of structure) {
    const ids = new Set(descendantIds(node.id));
    const inBlock = questions.filter((question) => question.structureId !== null && ids.has(question.structureId));
    const firstAnsweredAt = inBlock.flatMap((question) => answeredAt.get(question.id) ?? []).sort()[0];
    result.set(node.id, firstAnsweredAt ? inBlock.filter((question) => question.createdAt > firstAnsweredAt && !answeredAt.has(question.id)).length : 0);
  }
  return result;
}
