export type CampaignSnapshotQuestion = { id: string; structure_id: number | null };
export type CampaignSnapshotStructure = { id: number; parent_id: number | null; nome: string };

export function buildCampaignSnapshot(title: string, questions: CampaignSnapshotQuestion[], structures: CampaignSnapshotStructure[]) {
  const children = new Map<number, number[]>();
  for (const item of structures) if (item.parent_id) children.set(item.parent_id, [...(children.get(item.parent_id) ?? []), item.id]);
  const descendants = (id: number): number[] => [id, ...(children.get(id) ?? []).flatMap(descendants)];
  const levels = structures.flatMap((item) => {
    const ids = new Set(descendants(item.id)); const selected = questions.filter((question) => question.structure_id !== null && ids.has(question.structure_id));
    const hasChildWithQuestions = (children.get(item.id) ?? []).some((child) => questions.some((question) => question.structure_id !== null && descendants(child).includes(question.structure_id)));
    return selected.length && !hasChildWithQuestions ? [{ nome: item.nome, chave: `estrutura:${item.id}`, ids: selected.map((question) => question.id) }] : [];
  });
  const unstructured = questions.filter((question) => question.structure_id === null);
  if (unstructured.length) levels.unshift({ nome: title, chave: "sem-estrutura", ids: unstructured.map((question) => question.id) });
  return { questions, levels };
}
