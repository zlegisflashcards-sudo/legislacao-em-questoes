import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const automation = readFileSync("lib/student-first-access-server.ts", "utf8");
const webhook = readFileSync("lib/hotmart/webhook.ts", "utf8");
const admin = readFileSync("lib/commercial-admin-server.ts", "utf8");
const delivery = readFileSync("supabase/migrations/20260810140000_add_student_first_access_delivery.sql", "utf8");
const notifications = readFileSync("supabase/migrations/20260810200000_add_student_access_notifications.sql", "utf8");

describe("notificações de acesso", () => {
  it("define primeiro acesso pelo status de entrega, e não por user_id", () => {
    expect(automation).toContain('first.data?.status === "enviado"');
    expect(automation).toContain('first.data?.status ?? null');
    expect(automation).toContain('status === "falhou"');
    expect(delivery).toContain("status in ('reservado','enviado','falhou')");
  });

  it("cria ou atualiza Auth e gera nova credencial quando o primeiro acesso falhou", () => {
    expect(automation).toContain("auth.admin.createUser");
    expect(automation).toContain("auth.admin.updateUserById");
    expect(automation).toContain("deve_trocar_senha: true");
    expect(automation).toContain("Não foi possível reservar novamente o primeiro acesso.");
    expect(automation).toContain("Senha provisória: ${password}");
  });

  it("envia aviso simples para acessos posteriores com idempotência por evento", () => {
    expect(notifications).toContain("alunos_notificacoes_acesso");
    expect(notifications).toContain("idempotency_key text not null unique");
    expect(automation).toContain("sendNewAccessNotification");
    expect(automation).toContain("Novo acesso liberado na Legislação em Questões");
    expect(automation).toContain("notification_already_reserved");
    expect(automation).not.toMatch(/notificacao_novo_acesso_[\s\S]{0,160}password/i);
  });

  it("dispara para aquisição manual, liberação manual e webhook novo, não para reprocessamento Hotmart", () => {
    const acquisition = admin.slice(admin.lastIndexOf('if (resource === "aquisicoes")'), admin.indexOf('if (resource === "liberacoes")', admin.lastIndexOf('if (resource === "aquisicoes")')));
    expect(acquisition).toContain("accessLabel");
    expect(admin).toContain('kind: "release"');
    expect(webhook).toContain("accessLabel: produtoInterno.nome");
    expect(webhook).not.toContain("studentId: compraExistente.data.aluno_id");
  });

  it("mantém importação histórica sem envio em massa", () => {
    const historical = admin.slice(admin.indexOf("async function importHistoricalHotmartSales"), admin.indexOf("export async function mutateCommercialResource"));
    expect(historical).not.toContain("provisionStudentFirstAccess");
  });
});
