import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync("supabase/migrations/20261105132418_invalidate_question_reviews_after_import.sql", "utf8");

describe("invalidação de conferência após atualizar questões", () => {
  it("remove a conferência do nó afetado e da lei, sem apagar a estrutura", () => {
    expect(migration).toContain("delete from public.admin_question_law_reviews");
    expect(migration).toContain("delete from public.admin_question_structure_reviews");
    expect(migration).toContain("structure_id in (old.structure_id, new.structure_id)");
    expect(migration).not.toContain("delete from public.law_structure");
  });

  it("reage às alterações trazidas por importação, inclusive Assunto e Ordem", () => {
    expect(migration).toContain("after update of pergunta, resposta, justificativa, titulo, assunto, legislacao,");
    expect(migration).toContain("ordem, total_artigos, ultima_alteracao_legislativa on public.questions");
    expect(migration).toContain("old.assunto is not distinct from new.assunto");
    expect(migration).toContain("old.ordem is not distinct from new.ordem");
  });

  it("não remove a conferência em atualizações sem mudança editorial", () => {
    expect(migration).toContain("return new;");
    expect(migration).toContain("old.pergunta is not distinct from new.pergunta");
  });
});
