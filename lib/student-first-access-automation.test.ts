import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const notifications = readFileSync("lib/student-first-access-server.ts", "utf8");
const webhook = readFileSync("app/api/webhooks/hotmart/route.ts", "utf8");
const admin = readFileSync("lib/commercial-admin-server.ts", "utf8");
const delivery = readFileSync("supabase/migrations/20260810140000_add_student_first_access_delivery.sql", "utf8");
const notificationMigration = readFileSync("supabase/migrations/20260810200000_add_student_access_notifications.sql", "utf8");

describe("notificacoes de acesso independentes de Auth", () => {
  it("nao cria Auth, nao altera user_id e nao gera senha durante aquisicao ou liberacao", () => {
    expect(notifications).not.toContain("auth.admin.createUser");
    expect(notifications).not.toContain("auth.admin.updateUserById");
    expect(notifications).not.toContain("deve_trocar_senha");
    expect(notifications).not.toContain("alunos_primeiro_acesso_envios");
    expect(notifications).not.toContain("provisionalPassword");
  });

  it("envia o CTA de ativacao para aluno sem Auth e de acesso para aluno com Auth", () => {
    expect(notifications).toContain('if (!hasAuth)');
    expect(notifications).toContain("Ativar minha conta");
    expect(notifications).toContain("Acessar minha conta");
    expect(notifications).toContain("Boolean(student.user_id)");
    expect(notifications).toContain('const type = hasAuth ? "acessar_conta" : "ativar_conta"');
    expect(notifications).toContain("const activationUrl = hasAuth ? undefined");
  });

  it("mantem uma notificacao idempotente por nova aquisicao ou liberacao", () => {
    expect(notificationMigration).toContain("alunos_notificacoes_acesso");
    expect(notificationMigration).toContain("idempotency_key text not null unique");
    expect(notifications).toContain("notification_already_reserved");
    expect(notifications).toContain("tipo: type");
  });

  it("notifica aquisicao manual, liberacao manual e webhook novo sem reprovisionar Auth", () => {
    expect(admin).toContain("notifyStudentAccess");
    expect(admin).toContain('kind: "release"');
    expect(webhook).toContain("notifyStudentAccess");
    expect(webhook).not.toContain("studentId: compraExistente.data.aluno_id");
    expect(admin).toContain('notificationOrigin: "aquisicao_manual"');
    expect(admin).toContain('notificationOrigin: "liberacao_manual"');
    expect(webhook).toContain('notificationOrigin: "hotmart"');
    expect(notifications).toContain("deliverStudentAccessEmail");
  });

  it("mantem a importacao historica sem notificacao, Auth ou senha provisoria", () => {
    const historical = admin.slice(admin.indexOf("async function importHistoricalHotmartSales"), admin.indexOf("export async function mutateCommercialResource"));
    expect(historical).not.toContain("notifyStudentAccess");
    expect(historical).not.toContain("createUser");
    expect(delivery).toContain("status in ('reservado','enviado','falhou')");
  });

  it("mantem falha do Resend auditavel sem desfazer a aquisicao ou liberar Auth", () => {
    expect(notifications).toContain('stage: "resend_failed"');
    expect(notifications).toContain("notificacao_novo_acesso_falhou");
    expect(notifications).toContain("notification_already_reserved");
    expect(notifications).not.toContain("auth.admin.createUser");
  });
});
