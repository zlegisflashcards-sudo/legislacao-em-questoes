import { createHash } from "node:crypto";
import { groupDuplicateQuestionStatements } from "@/lib/admin-question-management";

export type DuplicateCleanupRow = {
  id: string; lei_id: number; slug: string; ordem: string; pergunta: string;
  resposta: string; justificativa: string | null; assunto: string | null;
  legislacao: string | null; titulo: string | null; structure_id: number | null;
  updated_at: string | null; ativo: boolean;
};
export const DUPLICATE_CLEANUP_FIELDS = "id,lei_id,slug,ordem,pergunta,resposta,justificativa,assunto,legislacao,titulo,structure_id,updated_at,ativo";
export const DUPLICATE_CLEANUP_CONFIRMATION = "INATIVAR DUPLICATAS DO BARALHO";

/** Same keeper rule as the existing per-group action; answer is NOT identity. */
export function planLawDuplicateCleanup(rows: DuplicateCleanupRow[], lawId: number, lawSlug: string) {
  const snapshot = rows.filter((row) => row.ativo && row.lei_id === lawId && row.slug.toLowerCase() === lawSlug.toLowerCase())
    .sort((a, b) => a.id.localeCompare(b.id))
    .map((row) => ({
      id: row.id, lei_id: row.lei_id, slug: row.slug, ordem: row.ordem, pergunta: row.pergunta,
      resposta: row.resposta, justificativa: row.justificativa, assunto: row.assunto,
      legislacao: row.legislacao, titulo: row.titulo, structure_id: row.structure_id,
      updated_at: row.updated_at, ativo: row.ativo,
    }));
  const groups = groupDuplicateQuestionStatements(snapshot).map((group) => ({
    retained: { id: group.questions[0].id, pergunta: group.questions[0].pergunta, ordem: group.questions[0].ordem },
    candidates: group.questions.slice(1).map(({ id, ordem, pergunta }) => ({ id, ordem, pergunta })),
  })).sort((a, b) => a.retained.id.localeCompare(b.retained.id));
  const token = createHash("sha256").update(JSON.stringify({ version: 1, lawId, lawSlug: lawSlug.toLowerCase(), snapshot, groups })).digest("hex");
  return { snapshot, groups, token, total: groups.reduce((sum, group) => sum + group.candidates.length, 0) };
}
