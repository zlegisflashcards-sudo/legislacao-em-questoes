import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync("supabase/migrations/20260811090000_create_admin_notifications.sql", "utf8");
const page = readFileSync("app/admin/notificacoes/page.tsx", "utf8");
const actions = readFileSync("app/admin/notification-actions.ts", "utf8");
const bell = readFileSync("components/admin/admin-notification-bell.tsx", "utf8");

describe("central de notificacoes administrativas", () => {
  it("cria uma notificacao para cada novo comentario, sem reagir a edicao ou curtida", () => {
    expect(migration).toContain("after insert on public.legisbot_comentarios_comunidade");
    expect(migration).toContain("'novo_comentario'");
    expect(migration).toContain("Novo comentário");
    expect(migration).not.toContain("after update on public.legisbot_comentarios_comunidade");
    expect(migration).not.toContain("legisbot_comentarios_curtidas");
  });

  it("deduplica a notificacao pelo comentario de origem", () => {
    expect(migration).toContain("unique (entidade_tipo, entidade_id)");
    expect(migration).toContain("on conflict (entidade_tipo, entidade_id) do nothing");
    expect(migration).toContain("new.id::text");
  });

  it("mostra badge apenas para nao lidas e lista paginada", () => {
    expect(bell).toContain('eq("lida", false)');
    expect(bell).toContain("🔔");
    expect(page).toContain("const PAGE_SIZE = 25");
    expect(page).toContain('request = request.eq("lida", false)');
    expect(page).toContain("Todas");
    expect(page).toContain("Não lidas");
  });

  it("marca uma, marca todas e marca antes de abrir", () => {
    expect(actions).toContain("markAdminNotificationRead");
    expect(actions).toContain("markAllAdminNotificationsRead");
    expect(actions).toContain("openAdminNotification");
    expect(actions).toContain("lida: true, lida_em");
    expect(page).toContain("Marcar todas como lidas");
    expect(page).toContain("Marcar como lida");
    expect(page).toContain("Abrir");
  });

  it("restringe leitura e acoes a administradores", () => {
    expect(migration).toContain("enable row level security");
    expect(migration).toContain("revoke all on public.admin_notificacoes from public, anon, authenticated");
    expect(page).toContain("exigirAdministrador()");
    expect(actions.match(/await exigirAdministrador\(\)/g)).toHaveLength(3);
    expect(bell).toContain("obterAdministrador()");
  });
});
