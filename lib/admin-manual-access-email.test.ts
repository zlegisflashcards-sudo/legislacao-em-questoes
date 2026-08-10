import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const notifier = readFileSync("lib/student-first-access-server.ts", "utf8");
const server = readFileSync("lib/commercial-admin-server.ts", "utf8");
const panel = readFileSync("components/admin/commercial-admin.tsx", "utf8");

describe("envio manual administrativo de e-mail de acesso", () => {
  it("escolhe ativacao para aluno sem Auth e acesso para aluno com Auth", () => {
    expect(notifier).toContain('const hasAuth = Boolean(student.user_id)');
    expect(notifier).toContain('const type = hasAuth ? "acessar_conta" : "ativar_conta"');
    expect(notifier).toContain("Ativar minha conta");
    expect(notifier).toContain("Acessar minha conta");
  });

  it("nao cria Auth, nao gera senha e nao altera o aluno", () => {
    const manual = notifier.slice(notifier.indexOf("export async function sendManualStudentAccessEmail"));
    expect(manual).not.toContain("auth.admin");
    expect(manual).not.toContain("deve_trocar_senha");
    expect(manual).not.toContain('.from("alunos").update');
  });

  it("registra diagnostico seguro do Resend em sucesso e falha", () => {
    expect(notifier).toContain('stage: "resend_started"');
    expect(notifier).toContain('stage: response.ok ? "resend_sent" : "resend_failed"');
    expect(notifier).toContain('stage: "resend_failed"');
    expect(notifier).toContain("status_http: response.status");
    expect(notifier).not.toContain("RESEND_API_KEY:");
    expect(notifier).not.toContain("password");
  });

  it("permite reenvio manual e evita clique duplo enquanto a requisicao esta pendente", () => {
    expect(notifier).toContain("randomUUID()");
    expect(server).toContain('action === "enviar_email_acesso"');
    expect(panel).toContain("Enviar e-mail de acesso");
    expect(panel).toContain("disabled={busy} onClick={() => void sendStudentAccessEmail()}");
    expect(panel).toContain("E-mail enviado com sucesso.");
    expect(panel).toContain("Falha ao enviar e-mail. Consulte o log do servidor.");
  });
});
