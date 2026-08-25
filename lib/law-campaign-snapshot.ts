export type CampaignSnapshotQuestion = { id: string; structure_id: number | null; ordem: string };
export type CampaignSnapshotStructure = { id: number; parent_id: number | null; nome: string };

export function buildCampaignSnapshot(title: string, questions: CampaignSnapshotQuestion[], structures: CampaignSnapshotStructure[]) {
  // A estrutura define somente os níveis da campanha. A sequência pedagógica
  // é sempre a ordem textual da questão, com ID como desempate estável.
  const orderedQuestions = [...questions].sort((left, right) =>
    left.ordem.localeCompare(right.ordem) || left.id.localeCompare(right.id),
  );
  const questionPosition = new Map(orderedQuestions.map((question, index) => [question.id, index]));
  const children = new Map<number, number[]>();
  for (const item of structures) if (item.parent_id) children.set(item.parent_id, [...(children.get(item.parent_id) ?? []), item.id]);
  const descendants = (id: number): number[] => [id, ...(children.get(id) ?? []).flatMap(descendants)];
  const levels = structures.flatMap((item) => {
    const ids = new Set(descendants(item.id)); const selected = orderedQuestions.filter((question) => question.structure_id !== null && ids.has(question.structure_id));
    const hasChildWithQuestions = (children.get(item.id) ?? []).some((child) => orderedQuestions.some((question) => question.structure_id !== null && descendants(child).includes(question.structure_id)));
    return selected.length && !hasChildWithQuestions ? [{ nome: item.nome, chave: `estrutura:${item.id}`, ids: selected.map((question) => question.id) }] : [];
  });
  const unstructured = orderedQuestions.filter((question) => question.structure_id === null);
  if (unstructured.length) levels.push({ nome: title, chave: "sem-estrutura", ids: unstructured.map((question) => question.id) });
  levels.sort((left, right) =>
    (questionPosition.get(left.ids[0]) ?? Number.MAX_SAFE_INTEGER)
    - (questionPosition.get(right.ids[0]) ?? Number.MAX_SAFE_INTEGER),
  );
  return { questions: orderedQuestions, levels };
}
