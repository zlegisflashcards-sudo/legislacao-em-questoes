import Link from "next/link";
import { getSupabaseServerClient } from "@/lib/supabase-server";

export default async function AdminNotificationBell() {
  // Os únicos consumidores são páginas que já chamaram exigirAdministrador().
  // Evita uma segunda validação Auth e COUNT EXACT sobre toda a tabela a cada /admin.
  const result = await getSupabaseServerClient().from("admin_notificacoes").select("id").eq("lida", false).limit(100);
  const unread = result.error ? 0 : result.data?.length ?? 0;
  const label = unread >= 100 ? "99+" : String(unread);
  return <Link className="admin-notification-bell" href="/admin/notificacoes" aria-label={`Notificações${unread ? `: ${label} não lida(s)` : ""}`}>🔔{unread ? <span>{label}</span> : null}</Link>;
}
