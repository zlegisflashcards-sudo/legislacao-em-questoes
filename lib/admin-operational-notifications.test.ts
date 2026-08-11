import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const triggerMigration = readFileSync("supabase/migrations/20260811100000_add_admin_operational_notifications.sql", "utf8");
const resend = readFileSync("lib/student-first-access-server.ts", "utf8");
const hotmart = readFileSync("app/api/webhooks/hotmart/route.ts", "utf8");
const central = readFileSync("app/admin/notificacoes/page.tsx", "utf8");
const commercial = readFileSync("components/admin/commercial-admin.tsx", "utf8");

describe("notificacoes operacionais administrativas", () => {
  it("cria alerta Resend somente na falha e o deduplica pela tentativa", () => {
    expect(resend).toContain('tipo: "erro_resend"');
    expect(resend).toContain("Falha no envio de e-mail");
    expect(resend).toContain('entidadeTipo: "erro_resend_envio"');
    expect(resend).toContain("entidadeId: input.idempotencyKey");
    expect(resend).toContain('stage: "resend_failed"');
    expect(resend).not.toContain("senha_provisoria");
  });

  it("cria alerta Hotmart apenas para erro relevante de processamento", () => {
    expect(hotmart).toContain('tipo: "erro_hotmart"');
    expect(hotmart).toContain("Falha no processamento da Hotmart");
    expect(hotmart).toContain("hotmartFailureContext");
    expect(hotmart).toContain('entidadeTipo: "erro_hotmart_evento"');
    expect(hotmart).toContain("return NextResponse.json({ success: true, duplicate: result.duplicate })");
  });

  it("detecta duplicidade por e-mail normalizado e mantem um alerta aberto por grupo", () => {
    expect(triggerMigration).toContain("public.normalizar_email_aluno(new.email)");
    expect(triggerMigration).toContain("v_count >= 2");
    expect(triggerMigration).toContain("'aluno_duplicado'");
    expect(triggerMigration).toContain("on conflict (entidade_tipo, entidade_id) do update");
    expect(triggerMigration).toContain("lida = false");
  });

  it("direciona cada alerta para a area operacional filtrada", () => {
    expect(resend).toContain("/admin/comercial?tab=alunos&q=");
    expect(hotmart).toContain("/admin/comercial?tab=aquisicoes&q=");
    expect(triggerMigration).toContain("/admin/comercial?tab=alunos&q=");
    expect(commercial).toContain('searchParams.get("tab")');
    expect(commercial).toContain('searchParams.get("q")');
  });

  it("mostra os novos rotulos na central sem alterar leitura e badge", () => {
    expect(central).toContain("erro_resend: \"E-mail\"");
    expect(central).toContain("erro_hotmart: \"Hotmart\"");
    expect(central).toContain("aluno_duplicado: \"Aluno duplicado\"");
    expect(central).toContain("typeLabel");
  });
});
