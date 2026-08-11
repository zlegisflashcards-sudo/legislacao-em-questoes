import Link from "next/link";
import { obterAdministrador } from "@/lib/admin-auth";
import { getSupabaseServerClient } from "@/lib/supabase-server";

export default async function AdminNotificationBell() {
  if (!await obterAdministrador()) return null;
  const result = await getSupabaseServerClient().from("admin_notificacoes").select("id", { count: "exact", head: true }).eq("lida", false);
  const unread = result.error ? 0 : result.count ?? 0;
  return <Link className="admin-notification-bell" href="/admin/notificacoes" aria-label={`Notificações${unread ? `: ${unread} não lida(s)` : ""}`}>🔔{unread ? <span>{unread}</span> : null}</Link>;
}
