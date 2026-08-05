import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("ações da conta autenticada", () => {
  const source = readFileSync("components/student-account.tsx", "utf8");
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
});
