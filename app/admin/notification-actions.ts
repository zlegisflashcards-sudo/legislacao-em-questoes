"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { exigirAdministrador } from "@/lib/admin-auth";
import { getSupabaseServerClient } from "@/lib/supabase-server";

function idFrom(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  return /^[0-9a-f-]{36}$/i.test(id) ? id : null;
}

function refreshNotifications() {
  revalidatePath("/admin");
  revalidatePath("/admin/notificacoes");
}

export async function markAdminNotificationRead(formData: FormData) {
  await exigirAdministrador();
  const id = idFrom(formData);
  if (!id) return;
  await getSupabaseServerClient().from("admin_notificacoes").update({ lida: true, lida_em: new Date().toISOString() }).eq("id", id).eq("lida", false);
  refreshNotifications();
}

export async function markAllAdminNotificationsRead() {
  await exigirAdministrador();
  await getSupabaseServerClient().from("admin_notificacoes").update({ lida: true, lida_em: new Date().toISOString() }).eq("lida", false);
  refreshNotifications();
}

export async function openAdminNotification(formData: FormData) {
  await exigirAdministrador();
  const id = idFrom(formData);
  const fallback = "/admin/notificacoes";
  if (!id) redirect(fallback);
  const notification = await getSupabaseServerClient().from("admin_notificacoes").select("link").eq("id", id).maybeSingle();
  await getSupabaseServerClient().from("admin_notificacoes").update({ lida: true, lida_em: new Date().toISOString() }).eq("id", id).eq("lida", false);
  refreshNotifications();
  const link = notification.data?.link;
  redirect(link && link.startsWith("/") && !link.startsWith("//") ? link : fallback);
}
