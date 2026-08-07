import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("ações da conta autenticada", () => {
  const source = readFileSync("components/student-account.tsx", "utf8");
  const linkRoute = readFileSync("app/api/aluno/vincular/route.ts", "utf8");
  const linkMigration = readFileSync("supabase/migrations/20260807200000_link_existing_students_on_auth.sql", "utf8");
  const profileStart = source.indexOf('if (mode === "profile" && profile)');
  const forgotStart = source.indexOf('if (mode === "forgot")');
  const profileView = source.slice(profileStart, forgotStart);

  it("exibe Alterar senha e Sair somente na visualização autenticada do perfil", () => {
    expect(profileStart).toBeGreaterThan(-1);
    expect(profileView).toContain('title="Conta"');
    expect(profileView).toContain(">Alterar senha</button>");
    expect(profileView).toContain(">Sair</button>");
    expect(source.slice(forgotStart)).not.toContain(">Sair</button>");
  });

  it("atualiza a senha pela sessão atual do Supabase", () => {
    expect(source).toContain("async function updateAuthenticatedPassword");
    expect(source).toContain("supabase.auth.updateUser({ password })");
    expect(profileView).toContain("action={updateAuthenticatedPassword}");
    expect(profileView.match(/autoComplete="new-password"/g)).toHaveLength(2);
  });

  it("encerra a sessão e retorna à página pública", () => {
    expect(source).toContain("async function signOut()");
    expect(source).toContain("await supabase.auth.signOut()");
    expect(source).toContain('window.location.assign("/")');
  });

  it("preserva o fluxo público de recuperação de senha", () => {
    expect(source).toContain("supabase.auth.resetPasswordForEmail");
    expect(source).toContain('redirectTo: `${window.location.origin}/conta?recuperar=1`');
  });

  it("vincula o aluno comercial após cadastro ou login sem tocar no perfil público", () => {
    expect(source).toContain('fetch("/api/aluno/vincular"');
    expect(linkRoute).toContain('rpc("vincular_aluno_para_usuario"');
    expect(linkMigration).toContain('lower(pg_catalog.btrim(email)) = v_email');
    expect(linkMigration).toContain("user_id is null");
    expect(linkMigration).toContain("return 'conflict'");
    expect(linkMigration).not.toContain("perfis_publicos");
  });
});
