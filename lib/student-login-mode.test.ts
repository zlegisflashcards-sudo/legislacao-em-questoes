import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const account = readFileSync("components/student-account.tsx", "utf8");

describe("separação entre login e cadastro", () => {
  it("envia a intenção explícita do formulário e só valida nome no cadastro", () => {
    expect(account).toContain('name="form_mode"');
    expect(account).toContain('if (formMode === "login")');
    expect(account.indexOf('if (formMode === "login")')).toBeLessThan(account.indexOf("validatePublicName(publicName)"));
  });
  it("mostra o link correto para cada tela", () => {
    expect(account).toContain('mode === "login" ? <button');
    expect(account).toContain("Criar uma conta");
    expect(account).toContain("Já tenho uma conta");
  });
});
