import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const account = readFileSync("components/student-account.tsx", "utf8");
const route = readFileSync("app/api/aluno/perfil/route.ts", "utf8");
const students = readFileSync("components/admin/students-admin.tsx", "utf8");

describe("nomes do aluno", () => {
  it("mantém nome completo e nome público como campos distintos no perfil", () => {
    expect(account).toContain('label="Nome público"');
    expect(account).toContain('label="Nome completo"');
    expect(account).not.toContain('label="Nome de usuário"');
  });
  it("valida e protege a atualização no servidor", () => {
    expect(route).toContain("currentUser(request)");
    expect(route).toContain('update({ ...(name !== null');
    expect(route).toContain('.eq("user_id", user.id)');
  });
  it("não apresenta e-mail como nome na ficha administrativa", () => {
    expect(students).toContain('text(student.nome) || "Nome não informado"');
    expect(students).toContain('text(selected.nome) || "Nome completo: Não informado"');
    expect(students).not.toContain("nome_usuario");
  });
});
