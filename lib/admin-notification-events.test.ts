import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync("supabase/migrations/20260811110000_expand_admin_notification_events.sql", "utf8");
const hotmart = readFileSync("app/api/webhooks/hotmart/route.ts", "utf8");
const webhook = readFileSync("lib/hotmart/webhook.ts", "utf8");
const commercial = readFileSync("lib/commercial-admin-server.ts", "utf8");
const activation = readFileSync("lib/student-activation-server.ts", "utf8");
const central = readFileSync("app/admin/notificacoes/page.tsx", "utf8");

describe("eventos da central administrativa", () => {
  it("notifica somente aquisições Hotmart novas e ignora reprocessamentos", () => {
    expect(hotmart).toContain('tipo: "nova_aquisicao"');
    expect(hotmart).toContain('entidadeTipo: "aquisicao_hotmart"');
    expect(hotmart).toContain('entidadeId: input.idempotencyKey');
    expect(webhook).toContain("if (compraExistente.data)");
    expect(webhook).toContain("return { duplicate: true }");
    expect(webhook).toContain("if (onValidAcquisition) await onValidAcquisition");
  });

  it("notifica aquisições e liberações manuais concluídas com chaves próprias", () => {
    expect(commercial).toContain('tipo: "nova_aquisicao"');
    expect(commercial).toContain('entidadeTipo: "aquisicao", entidadeId: purchaseId');
    expect(commercial).toContain('tipo: "nova_liberacao"');
    expect(commercial).toContain('entidadeTipo: "liberacao", entidadeId: releaseId');
    expect(commercial).not.toContain('tipo: "nova_aquisicao", titulo: "Importação histórica"');
  });

  it("diferencia comentário raiz, resposta e denúncia por gatilhos deduplicados", () => {
    expect(migration).toContain("if new.parent_id is null then");
    expect(migration).toContain("'novo_comentario'");
    expect(migration).toContain("'resposta_comentario'");
    expect(migration).toContain("'denuncia_comentario'");
    expect(migration).toContain("after insert on public.legisbot_comentarios_denuncias");
    expect(migration).toContain("'legisbot_denuncia_comentario'");
    expect(migration).toContain("on conflict (entidade_tipo, entidade_id) do nothing");
  });

  it("notifica ativação somente após concluir e usa a própria ativação como chave", () => {
    expect(activation).toContain('tipo: "conta_ativada"');
    expect(activation).toContain('entidadeTipo: "ativacao_conta", entidadeId: activation.id');
    expect(activation.indexOf('eq("id", activation.id).eq("reserved_at", reservedAt)')).toBeLessThan(activation.indexOf('tipo: "conta_ativada"'));
  });

  it("expõe todos os tipos e mantém os links operacionais", () => {
    for (const label of ["resposta_comentario", "denuncia_comentario", "nova_aquisicao", "nova_liberacao", "conta_ativada"]) expect(central).toContain(label);
    expect(hotmart).toContain("/admin/comercial?tab=aquisicoes&q=");
    expect(commercial).toContain("/admin/comercial?tab=alunos&q=");
    expect(migration).toContain("/legisbot/");
    expect(migration).toContain("/admin/comunidade?denunciados=1");
  });
});
