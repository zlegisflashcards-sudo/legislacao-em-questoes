import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const route = readFileSync("app/api/aluno/perfil/route.ts", "utf8");
const account = readFileSync("components/student-account.tsx", "utf8");

describe("telefone no meu perfil", () => {
  it("salva somente o telefone do aluno autenticado", () => {
    expect(route).toContain('!["nome", "telefone", "nome_publico"].includes(key)');
    expect(route).toContain('.eq("user_id", user.id)');
    expect(route).toContain("normalizeStudentPhone(telefoneRaw)");
  });
  it("exibe telefone editável e e-mail somente para consulta", () => {
    expect(account).toContain('label="Telefone / WhatsApp"');
    expect(account).toContain("E-mail de acesso:");
    expect(account).toContain("Precisa alterar seu e-mail?");
    expect(account).toContain('nome: name || null, telefone: phoneValue || null, nome_publico: publicName || null');
  });
});
