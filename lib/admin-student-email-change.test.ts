import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { createStudentEmailChangePayload } from "./admin-student-email-change";

const panel = readFileSync("components/admin/commercial-admin.tsx", "utf8");
const studentsPanel = readFileSync("components/admin/students-admin.tsx", "utf8");
const server = readFileSync("lib/commercial-admin-server.ts", "utf8");
const route = readFileSync("app/api/admin/comercial/alunos/route.ts", "utf8");

describe("troca administrativa de e-mail", () => {
  it("monta o mesmo corpo JSON aceito pelo handler", () => {
    const payload = createStudentEmailChangePayload(
      "00000000-0000-4000-8000-000000000001",
      " novo@email.com ",
      "ALTERAR",
    );
    expect(payload).toEqual({
      action: "trocar_email_acesso",
      id: "00000000-0000-4000-8000-000000000001",
      data: { email: " novo@email.com ", confirmacao: "ALTERAR", remover_conta_vazia: false },
    });
    expect(typeof payload.data).toBe("object");
    expect(JSON.parse(JSON.stringify(payload))).toEqual(payload);
  });

  it("envia o payload tipado em JSON e faz um unico parsing no servidor", () => {
    expect(panel).toContain("createStudentEmailChangePayload");
    expect(panel).toContain('body: JSON.stringify(payload)');
    expect(panel).toContain('"Content-Type": "application/json"');
    expect(server).toContain("const body = await readCommercialBody(request);");
    expect(server).toContain("const data = asObject(body.data);");
    expect(route).toContain('handleCommercialMutation("alunos", request)');
  });

  it("preserva as garantias de Auth, duplicidade, compensacao e auditoria", () => {
    expect(server).toContain('action === "trocar_email_acesso"');
    expect(server).toContain('findAuthUserByEmail(email)');
    expect(server).toContain("preflightStudentEmailChange");
    expect(server).toContain("supabase.auth.admin.updateUserById(current.data.user_id, { email, email_confirm: true })");
    expect(server).toContain('update({ email }).eq("id", alunoId)');
    expect(server).toContain("Falha ao compensar e-mail Auth");
    expect(server).toContain('acao: "trocar_email_acesso"');
  });

  it("mantem o modal aberto com a causa retornada e atualiza a ficha no sucesso", () => {
    expect(panel).toContain('aria-label="Alterar e-mail do aluno"');
    expect(panel).toContain("setEmailChangeError(caught instanceof Error ? caught.message");
    expect(panel).toContain("setStudent({ ...student, ...updated })");
    expect(panel).toContain("E-mail de acesso atualizado com sucesso.");
  });

  it("mantém o e-mail protegido no formulário geral e exige o fluxo específico", () => {
    expect(panel).toContain("Use “Editar e-mail” para alterar o acesso com confirmação segura.");
    expect(panel).toContain('readOnly aria-readonly="true"');
    expect(panel).toContain(">Editar e-mail</button>");
  });

  it("pré-valida conflitos e só permite remover uma conta Auth comprovadamente vazia", () => {
    expect(server).toContain('action === "prever_troca_email_acesso"');
    expect(server).toContain('status: "empty_auth"');
    expect(server).toContain('status: "auth_with_data"');
    expect(server).toContain('supabase.auth.admin.deleteUser(preflight.user_id)');
    expect(server).toContain("Não foi possível comprovar que a conta conflitante está vazia");
    expect(panel).toContain("Remover a conta sem dados que já utiliza este e-mail.");
  });

  it("mantém o e-mail do formulário geral somente leitura", () => {
    const inputStart = panel.indexOf('<input name="email"');
    const inputEnd = panel.indexOf('placeholder="E-mail"', inputStart);
    const input = inputStart >= 0 && inputEnd >= inputStart ? panel.slice(inputStart, inputEnd) : "";
    expect(input).toContain('value={editForm.email}');
    expect(input).toContain("readOnly");
    expect(input).not.toContain("onChange=");
    expect(input).not.toContain("disabled");
    expect(panel).toContain('setEditForm({ email: text(student.email) })');
  });

  it("integra o mesmo fluxo seguro à rota administrativa de alunos", () => {
    expect(studentsPanel).toContain('value={text(selected.email)} readOnly aria-readonly="true"');
    expect(studentsPanel).toContain(">Editar e-mail</button>");
    expect(studentsPanel).toContain('action: "prever_troca_email_acesso"');
    expect(studentsPanel).toContain("createStudentEmailChangePayload");
    expect(studentsPanel).toContain("O ID do usuário será mantido e os vínculos do aluno serão preservados.");
    expect(studentsPanel).toContain("setSelected({ ...selected, ...updated })");
    expect(studentsPanel).toContain("Remover conta vazia e continuar");
    expect(studentsPanel).toContain("Digite <strong>REMOVER</strong>");
    expect(studentsPanel).toContain("Abrir aluno duplicado");
  });
});
