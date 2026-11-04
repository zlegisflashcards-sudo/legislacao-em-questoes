import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const server = readFileSync("lib/student-shortcuts-server.ts", "utf8");
const client = readFileSync("components/student-shortcuts-client.tsx", "utf8");
const migration = readFileSync("supabase/migrations/20261104185509_add_student_shortcut_colors.sql", "utf8");

describe("Meus Atalhos", () => {
  it("persiste somente a cor do atalho pessoal e preserva a ordem existente", () => {
    expect(migration).toContain("add column if not exists atalho_cor");
    expect(migration).toContain("default 'azul'");
    expect(migration).toContain("function public.definir_cor_atalho_meu_edital");
    expect(migration).toContain("atalho.edital_id = edital.id");
    expect(migration).toContain("grant execute on function public.definir_cor_atalho_meu_edital");
  });

  it("carrega uma projeção leve, sem campanhas, respostas ou questões", () => {
    expect(server).toContain('rpc("obter_meus_atalhos")');
    expect(server).not.toContain("campanhas_leis_respostas");
    expect(server).not.toContain("progresso_leis_alunos");
    expect(migration).toContain("function public.obter_meus_atalhos()");
    expect(migration).not.toContain("campanhas_leis_respostas");
    expect(migration).not.toContain("questions");
  });

  it("preserva recortes, desabilita prefetch e informa bloqueio sem apagar a cor", () => {
    expect(client).toContain("recorte_id=${encodeURIComponent(shortcut.recorteId)}");
    expect(client).toContain("prefetch={false}");
    expect(client).toContain("🔒");
    expect(client).toContain("confirmReplace: Boolean(existing)");
  });
});
