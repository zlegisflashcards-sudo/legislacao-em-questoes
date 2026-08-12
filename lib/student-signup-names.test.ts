import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const account = readFileSync("components/student-account.tsx", "utf8");
const migration = readFileSync("supabase/migrations/20260812120000_generate_public_name_on_signup.sql", "utf8");

describe("nomes no cadastro", () => {
  it("solicita nome completo e deixa o nome público opcional", () => {
    expect(account).toContain('label="Nome completo" name="nome"');
    expect(account).toContain('label="Nome público (opcional)"');
    expect(account).toContain('if (!fullName)');
  });
  it("persiste os dois valores na metadata de Auth", () => {
    expect(account).toContain('data: { nome: fullName, nome_publico: publicName || undefined }');
  });
  it("gera e persiste nome público automático único", () => {
    expect(migration).toContain("'estudante' ||");
    expect(migration).toContain("lpad((floor(random() * 1000000))");
    expect(migration).toContain("while suggested_name is null loop");
  });
});
