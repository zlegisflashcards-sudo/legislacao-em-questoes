import Link from "next/link";
import { markAdminNotificationRead, markAllAdminNotificationsRead, openAdminNotification } from "@/app/admin/notification-actions";
import { sairAdministrador } from "@/app/admin/actions";
import AdminNotificationBell from "@/components/admin/admin-notification-bell";
import { exigirAdministrador } from "@/lib/admin-auth";
import { getSupabaseServerClient } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";
const PAGE_SIZE = 25;
type Query = Record<string, string | string[] | undefined>;
const one = (value: string | string[] | undefined) => Array.isArray(value) ? value[0] ?? "" : value ?? "";
const fmt = (value: string) => new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date(value));
const typeLabel = (type: string) => ({ novo_comentario: "Comentário", erro_resend: "E-mail", erro_hotmart: "Hotmart", aluno_duplicado: "Aluno duplicado" }[type] ?? type);
function href(page: number, unread: boolean) { const params = new URLSearchParams({ page: String(page) }); if (unread) params.set("filtro", "nao_lidas"); return `/admin/notificacoes?${params}`; }

export default async function AdminNotificationsPage({ searchParams }: { searchParams: Promise<Query> }) {
  const [query, admin] = await Promise.all([searchParams, exigirAdministrador()]);
  const unread = one(query.filtro) === "nao_lidas";
  const page = Math.max(1, Number(one(query.page)) || 1);
  const start = (page - 1) * PAGE_SIZE;
  let request = getSupabaseServerClient().from("admin_notificacoes").select("*", { count: "exact" });
  if (unread) request = request.eq("lida", false);
  const result = await request.order("created_at", { ascending: false }).range(start, start + PAGE_SIZE - 1);
  if (result.error) throw new Error("Não foi possível carregar as notificações.");
  const pages = Math.max(1, Math.ceil((result.count ?? 0) / PAGE_SIZE));
  return <main className="admin-shell"><Link className="admin-central-link" href="/admin">← Central Administrativa</Link><header className="admin-header"><div><div className="admin-eyebrow">Administração</div><h1>Central de Notificações</h1><p>{result.count ?? 0} notificação(ões) encontrada(s)</p></div><div className="admin-header-actions"><AdminNotificationBell /><span>{admin.email}</span><form action={sairAdministrador}><button className="admin-button secondary">Sair</button></form></div></header><div className="admin-notification-toolbar"><div className="admin-notification-filters"><Link className={`admin-button ${!unread ? "primary" : "secondary"}`} href={href(1, false)}>Todas</Link><Link className={`admin-button ${unread ? "primary" : "secondary"}`} href={href(1, true)}>Não lidas</Link></div><form action={markAllAdminNotificationsRead}><button className="admin-button secondary">Marcar todas como lidas</button></form></div>{result.data?.length ? <section className="admin-notification-list" aria-label="Lista de notificações">{result.data.map((item) => <article className={`admin-notification-item ${item.lida ? "read" : "unread"}`} key={String(item.id)}><div><small>{typeLabel(String(item.tipo))}</small><h2>{String(item.titulo)}</h2><p>{String(item.mensagem)}</p><small>{fmt(String(item.created_at))}{item.lida ? " · Lida" : " · Não lida"}</small></div><div className="admin-notification-actions"><form action={openAdminNotification}><input type="hidden" name="id" value={String(item.id)} /><button className="admin-button primary">Abrir</button></form>{!item.lida ? <form action={markAdminNotificationRead}><input type="hidden" name="id" value={String(item.id)} /><button className="admin-button secondary">Marcar como lida</button></form> : null}</div></article>)}</section> : <div className="admin-empty"><h2>Nenhuma notificação</h2><p>Novos comentários aparecerão aqui.</p></div>}<nav className="admin-pagination" aria-label="Paginação"><Link aria-disabled={page <= 1} className={page <= 1 ? "disabled" : ""} href={href(page - 1, unread)}>← Anterior</Link><span>Página {page} de {pages}</span><Link aria-disabled={page >= pages} className={page >= pages ? "disabled" : ""} href={href(page + 1, unread)}>Próxima →</Link></nav></main>;
}
