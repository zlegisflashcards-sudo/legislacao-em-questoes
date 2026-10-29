import type { DuplicateCleanupRow } from "./admin-law-duplicate-cleanup";
export function row(id: number, pergunta = "Assertiva.", patch: Partial<DuplicateCleanupRow> = {}): DuplicateCleanupRow {
  return { id: `00000000-0000-0000-0000-${String(id).padStart(12, "0")}`, lei_id: 1, slug: "l8429", ordem: "1", pergunta, resposta: "Certo", justificativa: "J", assunto: "A", legislacao: "L", titulo: "T", structure_id: null, updated_at: "2026-10-29T00:00:00+00:00", ativo: true, ...patch };
}
