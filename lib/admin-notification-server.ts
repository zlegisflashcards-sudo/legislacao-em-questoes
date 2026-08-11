import type { SupabaseClient } from "@supabase/supabase-js";

type AdminNotificationInput = {
  tipo: "erro_resend" | "erro_hotmart" | "nova_aquisicao" | "nova_liberacao" | "conta_ativada";
  titulo: string;
  mensagem: string;
  link?: string;
  entidadeTipo: string;
  entidadeId: string;
};

/** Best-effort operational alert. A duplicate event never interrupts its source flow. */
export async function createOperationalAdminNotification(supabase: SupabaseClient, input: AdminNotificationInput) {
  const result = await supabase.from("admin_notificacoes").insert({ tipo: input.tipo, titulo: input.titulo, mensagem: input.mensagem.slice(0, 1000), link: input.link ?? null, entidade_tipo: input.entidadeTipo, entidade_id: input.entidadeId });
  if (result.error && result.error.code !== "23505") console.error("[admin-notification] create_failed", { tipo: input.tipo, entidade_tipo: input.entidadeTipo, entidade_id: input.entidadeId, code: result.error.code, message: result.error.message });
}
