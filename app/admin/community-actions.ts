"use server";

import { revalidatePath } from "next/cache";
import { exigirAdministrador } from "@/lib/admin-auth";
import { getSupabaseServerClient } from "@/lib/supabase-server";

const STATUSES = new Set(["publicado", "oculto", "removido", "em_analise"]);

export async function moderateCommunityComment(formData: FormData) {
  await exigirAdministrador();
  const id = String(formData.get("id") ?? "");
  const status = String(formData.get("status") ?? "");
  if (!/^[0-9a-f-]{36}$/i.test(id) || !STATUSES.has(status)) return;
  const changes: Record<string, unknown> = { status };
  if (status === "removido") Object.assign(changes, { conteudo: null, deleted_at: new Date().toISOString() });
  if (status === "publicado") Object.assign(changes, { deleted_at: null });
  const supabase = getSupabaseServerClient();
  const result = await supabase.from("legisbot_comentarios_comunidade").update(changes).eq("id", id);
  if (!result.error && status !== "em_analise") {
    await supabase.from("legisbot_comentarios_denuncias").update({ status: "resolvida" }).eq("comentario_id", id).in("status", ["pendente", "em_analise"]);
  }
  revalidatePath("/admin/comunidade");
}
