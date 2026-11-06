import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync("supabase/migrations/20260810130000_add_student_provisional_password_flag.sql", "utf8");
const server = readFileSync("lib/commercial-admin-server.ts", "utf8");
const passwordService = readFileSync("lib/student-provisional-password-server.ts", "utf8");
const studentCenter = readFileSync("lib/student-center-server.ts", "utf8");
const studentCenterUi = readFileSync("components/admin/student-center.tsx", "utf8");
const account = readFileSync("components/student-account.tsx", "utf8");
const provisionalRoute = readFileSync("app/api/aluno/acesso-provisorio/route.ts", "utf8");
const studentLaws = readFileSync("lib/student-laws-server.ts", "utf8");
const lawStudy = readFileSync("lib/law-study-server.ts", "utf8");

describe("senha provisória de primeiro acesso", () => {
  it("mantém o marcador obrigatório no aluno, sem guardar senha", () => {
    expect(migration).toContain("deve_trocar_senha boolean not null default false");
    expect(migration).not.toMatch(/senha_provisoria|password/i);
  });

  it("cria ou reutiliza somente o Auth do mesmo aluno", () => {
    expect(server).toContain('action === "gerar_senha_provisoria"');
    expect(server).toContain("generateStudentProvisionalPassword");
    expect(passwordService).toContain("findAuthUserByEmail");
    expect(passwordService).toContain("auth.admin.createUser");
    expect(passwordService).toContain("auth.admin.updateUserById");
    expect(passwordService).toContain("Acesso bloqueado: existe duplicidade histórica para este e-mail.");
    expect(passwordService).toContain("Acesso bloqueado: a conta Auth já pertence a outro aluno.");
    expect(passwordService).toContain("deve_trocar_senha: true");
  });

  it("não registra a senha provisória em auditoria ou logs", () => {
    const action = passwordService.slice(passwordService.indexOf("export async function generateStudentProvisionalPassword"));
    expect(action).not.toContain("console.");
    expect(action).toContain("detalhes: { user_id");
    expect(passwordService).toContain("randomBytes(18)");
  });

  it("reutiliza o fluxo na ficha individual, exige confirmação e trata OAuth exclusivo", () => {
    expect(studentCenter).toContain('action === "gerar_senha_provisoria"');
    expect(studentCenter).toContain("generateStudentProvisionalPassword(alunoId, actor.id)");
    expect(studentCenter).toContain("Autenticação administrativa obrigatória.");
    expect(studentCenterUi).toContain("🔑 Gerar senha provisória");
    expect(studentCenterUi).toContain("window.confirm");
    expect(studentCenterUi).toContain("Copiar senha");
    expect(passwordService).toContain("auth.admin.getUserById");
    expect(passwordService).toContain("provedor externo");
  });

  it("exige a troca após o login e limpa o marcador somente depois da senha Auth", () => {
    expect(account).toContain('"firstAccess"');
    expect(account).toContain("needsProvisionalPasswordChange");
    expect(account).toContain('accountStepPath("primeiro-acesso", returnPath)');
    expect(account).toContain('title="Crie sua nova senha"');
    expect(account).toContain("supabase.auth.updateUser({ password })");
    expect(account).toContain('window.location.assign(returnPath)');
    expect(provisionalRoute).toContain("deve_trocar_senha: false");
  });

  it("bloqueia as áreas autenticadas enquanto a troca estiver pendente", () => {
    for (const source of [studentLaws, lawStudy]) expect(source).toContain("deve_trocar_senha === true");
    expect(studentLaws).toContain("Crie sua nova senha antes de acessar suas leis.");
  });
});
