import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { createStudentEmailChangePayload } from "./admin-student-email-change";

const panel = readFileSync("components/admin/commercial-admin.tsx", "utf8");
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
      data: { email: " novo@email.com ", confirmacao: "ALTERAR" },
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
    expect(server).toContain('"Este e-mail já está vinculado a outro aluno ou conta."');
    expect(server).toContain("supabase.auth.admin.updateUserById(current.data.user_id, { email })");
    expect(server).toContain('update({ email }).eq("id", alunoId)');
    expect(server).toContain("Falha ao compensar e-mail Auth");
    expect(server).toContain('acao: "trocar_email_acesso"');
  });

  it("mantem o modal aberto com a causa retornada e atualiza a ficha no sucesso", () => {
    expect(panel).toContain('aria-label="Trocar e-mail de acesso"');
    expect(panel).toContain("setEmailChangeError(caught instanceof Error ? caught.message");
    expect(panel).toContain("setStudent({ ...student, ...updated })");
    expect(panel).toContain("E-mail de acesso atualizado com sucesso.");
  });

  it("reutiliza a troca segura ao salvar o e-mail pelo formulario de edicao", () => {
    expect(panel).toContain("const nextEmail = text(data.email).trim().toLowerCase();");
    expect(panel).toContain('createStudentEmailChangePayload(text(student.id), text(data.email), "ALTERAR")');
    expect(panel).toContain('action: "atualizar", id: student.id, data');
    expect(panel.indexOf("createStudentEmailChangePayload(text(student.id), text(data.email), \"ALTERAR\")")).toBeLessThan(panel.indexOf('action: "atualizar", id: student.id, data'));
  });

  it("mantem o e-mail do formulario de edicao controlado e digitavel", () => {
    expect(panel).toContain('value={studentEditEmail}');
    expect(panel).toContain('onChange={(event) => setStudentEditEmail(event.target.value)}');
    expect(panel).toContain('if (!editing) setStudentEditEmail(text(student.email));');
  });
});
