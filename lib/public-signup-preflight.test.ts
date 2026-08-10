import { describe, expect, it } from "vitest";
import { hasNormalizedEmail, normalizeStudentEmail } from "./public-signup-preflight";
import { readFileSync } from "node:fs";

describe("preflight do cadastro publico", () => {
  it("aceita um e-mail novo", () => {
    expect(hasNormalizedEmail([{ email: "existente@email.com" }], "novo@email.com")).toBe(false);
  });

  it("normaliza o e-mail antes de localizar aluno ou Auth", () => {
    expect(normalizeStudentEmail(" TESTE@EMAIL.COM ")).toBe("teste@email.com");
    expect(hasNormalizedEmail([{ email: " teste@email.com " }], "TESTE@email.com")).toBe(true);
    expect(hasNormalizedEmail([{ email: "teste@email.com" }], " teste@email.com ")).toBe(true);
  });

  it("bloqueia Auth existente, mas permite ativar aluno existente sem Auth", () => {
    const account = readFileSync("components/student-account.tsx", "utf8");
    const preflight = readFileSync("app/api/aluno/verificar-cadastro/route.ts", "utf8");
    expect(account.indexOf('fetch("/api/aluno/verificar-cadastro"')).toBeLessThan(account.indexOf("supabase.auth.signUp"));
    expect(account).toContain("preflightResult.exists");
    expect(preflight).toContain('from("alunos")');
    expect(preflight).toContain("auth.admin.listUsers");
    expect(preflight).toContain('select("id,email,user_id")');
    expect(preflight).toContain("authExists || Boolean(student?.user_id)");
    expect(preflight).toContain("activation: Boolean(student && !exists)");
  });
});
