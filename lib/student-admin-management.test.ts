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
  it("pré-valida FKs e não mascara o erro técnico de mesclagem", () => {
    const hardening = readFileSync("supabase/migrations/20260810090000_harden_student_merge_diagnostics.sql", "utf8");
    expect(hardening).toContain("Referencia pendente nao suportada");
    expect(hardening).toContain("Falha merge alunos principal");
    expect(server).toContain("Falha na mesclagem administrativa de alunos");
    expect(server).toContain("Não foi possível mesclar:");
  });
  it("envia os nomes de argumentos idênticos à assinatura PostgREST", () => {
    for (const argument of ["p_ator_user_id", "p_principal", "p_secundario", "p_nome_final"]) expect(server).toContain(argument);
    expect(server).toContain("argumentNames: Object.keys(params).sort()");
  });
  it("transfere Auth do secundário somente após desvinculá-lo, e bloqueia Auths diferentes", () => {
    const migration = readFileSync("supabase/migrations/20260810120000_fix_student_merge_auth_transfer_order.sql", "utf8");
    expect(migration).toContain("update public.alunos set user_id=null where id=p_secundario;");
    expect(migration).toContain("update public.alunos set user_id=v_user_id where id=p_principal;");
    expect(migration.indexOf("set user_id=null where id=p_secundario")).toBeLessThan(migration.indexOf("set user_id=v_user_id where id=p_principal"));
    expect(migration).toContain("a.user_id<>b.user_id");
  });
  it("mantém ações exclusivamente no endpoint administrativo", () => {
    expect(server).toContain('resource === "alunos" && action === "mesclar"');
    expect(ui).toContain("Mesclar cadastros");
    expect(ui).toContain("Novo aluno");
  });
});
