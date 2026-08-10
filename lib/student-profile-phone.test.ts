import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const route = readFileSync("app/api/aluno/perfil/route.ts", "utf8");
const account = readFileSync("components/student-account.tsx", "utf8");

describe("telefone no meu perfil", () => {
  it("salva somente o telefone do aluno autenticado", () => {
    expect(route).toContain('Object.keys(body).join(",") !== "telefone"');
    expect(route).toContain('.eq("user_id", user.id)');
    expect(route).toContain("value.trim()");
    expect(route).toContain("telefone.length > 80");
  });
  it("exibe telefone editável e e-mail somente para consulta", () => {
    expect(account).toContain('label="Telefone"');
    expect(account).toContain("E-mail de acesso:");
    expect(account).toContain("Precisa alterar seu e-mail?");
    expect(account).toContain('body: JSON.stringify({ telefone: phoneValue || null })');
  });
});
