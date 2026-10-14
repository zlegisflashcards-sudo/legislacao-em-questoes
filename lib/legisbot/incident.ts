import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

export type LegisBotIncidentType = "vinculacao" | "sem_conteudo" | "legislacao_ausente" | "falha_tecnica";

export async function registerLegisBotIncident(
  supabase: SupabaseClient,
  input: { slug: string; ordem: string; type: LegisBotIncidentType; userId?: string | null },
) {
  const result = await supabase.rpc("registrar_ocorrencia_legisbot", {
    p_slug: input.slug.toLowerCase(),
    p_ordem: input.ordem,
    p_tipo: input.type,
    p_usuario_id: input.userId ?? null,
  });
  // A migration can be pending during rollout; logging must never interrupt study.
  if (result.error) console.error("[LegisBot] Não foi possível registrar ocorrência.", { type: input.type, code: result.error.code });
}
