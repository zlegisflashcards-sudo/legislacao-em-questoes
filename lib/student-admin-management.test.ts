import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync("supabase/migrations/20260809010000_admin_student_management.sql", "utf8");
const server = readFileSync("lib/commercial-admin-server.ts", "utf8");
const ui = readFileSync("components/admin/commercial-admin.tsx", "utf8");

describe("gerência administrativa de alunos", () => {
  it("cria manualmente, normaliza e rejeita e-mail existente", () => {
    expect(migration).toContain("admin_criar_aluno");
    expect(migration).toContain("normalizar_email_aluno");
    expect(migration).toContain("Ja existe um aluno cadastrado");
  });
  it("edita nome e bloqueia troca de e-mail com Auth", () => {
    expect(migration).toContain("admin_atualizar_aluno");
    expect(migration).toContain("nao pode ser alterado sem sincronizacao segura");
  });
  it("preserva compras, liberações e progresso numa mesclagem transacional", () => {
    expect(migration).toContain("update public.compras set aluno_id=p_principal");
    expect(migration).toContain("update public.liberacoes_leis set aluno_id=p_principal");
    expect(migration).toContain("update public.progresso_leis_alunos set aluno_id=p_principal");
    expect(migration).toContain("delete from public.alunos where id=p_secundario");
  });
  it("bloqueia duas contas Auth e exclusão com vínculos", () => {
    expect(migration).toContain("contas de autenticacao diferentes");
    expect(migration).toContain("admin_excluir_aluno_vazio");
    expect(migration).toContain("Exclusao bloqueada");
  });
  it("mantém ações exclusivamente no endpoint administrativo", () => {
    expect(server).toContain('resource === "alunos" && action === "mesclar"');
    expect(ui).toContain("Mesclar cadastros");
    expect(ui).toContain("Novo aluno");
  });
});
