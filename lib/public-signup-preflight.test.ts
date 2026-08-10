import { describe, expect, it } from "vitest";
import { hasNormalizedEmail, normalizeStudentEmail } from "./public-signup-preflight";
import { readFileSync } from "node:fs";

describe("preflight do cadastro público", () => {
  it("aceita um e-mail novo", () => {
    expect(hasNormalizedEmail([{ email: "existente@email.com" }], "novo@email.com")).toBe(false);
  });

  it("bloqueia e-mail existente de aluno ou Auth após normalização", () => {
    expect(normalizeStudentEmail(" TESTE@EMAIL.COM ")).toBe("teste@email.com");
    expect(hasNormalizedEmail([{ email: " teste@email.com " }], "TESTE@email.com")).toBe(true);
    expect(hasNormalizedEmail([{ email: "teste@email.com" }], " teste@email.com ")).toBe(true);
  });

  it("consulta o backend antes de iniciar o signup e não reenvia confirmação para conta existente", () => {
    const account = readFileSync("components/student-account.tsx", "utf8");
    const preflight = readFileSync("app/api/aluno/verificar-cadastro/route.ts", "utf8");
    expect(account.indexOf('fetch("/api/aluno/verificar-cadastro"')).toBeLessThan(account.indexOf("supabase.auth.signUp"));
    expect(account).toContain("Já existe uma conta com este e-mail. Entre com sua senha ou use 'Esqueci minha senha'.");
    expect(preflight).toContain('from("alunos")');
    expect(preflight).toContain("auth.admin.listUsers");
  });
});
