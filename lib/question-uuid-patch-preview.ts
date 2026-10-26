import { classifyQuestionPatch, type QuestionPatch } from "./question-uuid-patch";

export type PatchQuestion = { id: string; lei_id: number; ativo: boolean; assunto: string | null; ordem: string | null; updated_at: string | null };
export function buildQuestionPatchPreview(patch: QuestionPatch, lawId: number, rows: PatchQuestion[]) {
  const byId = new Map(rows.map((row) => [row.id, row]));
  const items = patch.updates.map((item) => {
    const row = byId.get(item.uuid);
    const invalid = !row || row.lei_id !== lawId || !row.ativo;
    const status = invalid ? "indisponivel" : classifyQuestionPatch(item, { assunto: row.assunto ?? "", ordem: row.ordem ?? "" });
    const final = { ...item.expected_before, ...item.changes };
    return { uuid: item.uuid, status, current: row ? { assunto: row.assunto, ordem: row.ordem } : null, expected: item.expected_before, proposed: final, changes: item.changes, updated_at: row?.updated_at ?? null };
  });
  const counts = { questions: items.length, aptos: items.filter((item) => item.status === "apto").length, ja_aplicados: items.filter((item) => item.status === "ja_aplicado").length, conflitos: items.filter((item) => item.status === "conflito" || item.status === "indisponivel").length, campos: items.filter((item) => item.status === "apto").reduce((sum, item) => sum + Object.keys(item.changes).length, 0) };
  return { items, counts };
}
