import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const automation = readFileSync("lib/student-first-access-server.ts", "utf8");
const webhook = readFileSync("lib/hotmart/webhook.ts", "utf8");
const webhookRoute = readFileSync("app/api/webhooks/hotmart/route.ts", "utf8");
const admin = readFileSync("lib/commercial-admin-server.ts", "utf8");
const migration = readFileSync("supabase/migrations/20260810140000_add_student_first_access_delivery.sql", "utf8");

describe("automação de primeiro acesso por aquisição", () => {
  it("reserva o envio por aluno e não persiste senha", () => {
    expect(migration).toContain("aluno_id uuid primary key");
    expect(migration).toContain("idempotency_key text not null unique");
    expect(migration).not.toMatch(/\bsenha\s+(text|varchar)|\bpassword\s+(text|varchar)/i);
    expect(automation).toContain('status: "reservado"');
    expect(automation).toContain('status: "enviado"');
    expect(automation).toContain('status: "falhou"');
  });

  it("cria Auth somente para o aluno sem Auth e exige a troca", () => {
    expect(automation).toContain('if (student.user_id) {');
    expect(automation).toContain('reason: "already_linked"');
    expect(automation).toContain("auth.admin.createUser");
    expect(automation).toContain("deve_trocar_senha: true");
    expect(automation).toContain("existing_auth_linked");
    expect(automation).toContain("duplicidade histórica");
  });

  it("envia apenas um e-mail idempotente, sem expor a credencial em auditoria", () => {
    expect(automation).toContain('"Idempotency-Key": idempotencyKey');
    expect(automation).toContain("https://api.resend.com/emails");
    expect(automation).toContain("email_primeiro_acesso_enviado");
    expect(automation).toContain("email_primeiro_acesso_falhou");
    const auditArea = automation.slice(automation.indexOf("async function audit"), automation.indexOf("async function sendFirstAccessEmail"));
    expect(auditArea).not.toContain("password");
  });

  it("dispara somente após uma aquisição nova e válida do webhook", () => {
    expect(webhook).toContain("onValidAcquisition");
    expect(webhook).toContain("await liberarLeisDaCompra");
    expect(webhook.indexOf("await liberarLeisDaCompra")).toBeLessThan(webhook.indexOf("onValidAcquisition({"));
    expect(webhookRoute).toContain("provisionStudentFirstAccess");
    expect(webhook).toContain("if (compraExistente.data)");
    expect(webhook).toContain('idempotencyKey: `hotmart:${evento.codigo_transacao}`');
    expect(webhookRoute).toContain("[hotmart-first-access] failed");
    expect(automation).toContain("first_access_reserved");
    expect(automation).toContain("resend_requested");
    expect(automation).toContain("resend_sent");
  });

  it("também dispara na aquisição manual, mas não na importação histórica", () => {
    const historical = admin.slice(admin.indexOf("async function importHistoricalHotmartSales"), admin.indexOf("export async function mutateCommercialResource"));
    expect(historical).not.toContain("provisionStudentFirstAccess");
    const manual = admin.slice(admin.lastIndexOf('if (resource === "aquisicoes")'), admin.indexOf('if (resource === "liberacoes")', admin.lastIndexOf('if (resource === "aquisicoes")')));
    expect(manual).toContain("await provisionStudentFirstAccess");
    expect(manual).toContain("administrativo:");
  });
});
