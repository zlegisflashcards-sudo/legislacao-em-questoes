import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { LegisBotComentario } from "@/lib/legisbot-comentario";
import type { LegisBotIdentifiers } from "./request-validation";
import {
  GenerationRepositoryError,
  type GenerationDecision,
  type GenerationReservation,
  type LegisBotGenerationRepository,
} from "./generation-repository-types";

export { GenerationRepositoryError } from "./generation-repository-types";
export type {
  GenerationDecision,
  GenerationReservation,
  LegisBotGenerationRepository,
} from "./generation-repository-types";

const TABLE = "legisbot_comentarios";

export async function findLegisBotComment(
  supabase: SupabaseClient,
  identifiers: LegisBotIdentifiers,
): Promise<LegisBotComentario | null> {
  const { data, error } = await supabase
    .from(TABLE)
    .select("*")
    .eq("slug", identifiers.slug)
    .eq("ordem", identifiers.ordem)
    .maybeSingle();
  if (error) throw new GenerationRepositoryError("Falha ao consultar o comentário.");
  return data as LegisBotComentario | null;
}

export function createSupabaseGenerationRepository(
  supabase: SupabaseClient,
): LegisBotGenerationRepository {
  return {
    async reserve(userId, identifiers, input) {
      const { data, error } = await supabase.rpc("reservar_geracao_legisbot", {
        p_user_id: userId,
        p_slug: identifiers.slug,
        p_ordem: identifiers.ordem,
        p_titulo: input.titulo,
        p_assunto: input.assunto,
        p_legislacao: input.legislacao,
      });
      if (error) {
        throw new GenerationRepositoryError(
          "Falha ao reservar a geração.",
          error.code === "22023",
        );
      }
      const row = Array.isArray(data) ? data[0] : data;
      if (!row || typeof row.decisao !== "string") {
        throw new GenerationRepositoryError("A reserva retornou uma resposta inválida.");
      }
      return {
        decision: row.decisao as GenerationDecision,
        commentId: row.comentario_id === null ? null : Number(row.comentario_id),
        retryAfter: row.tentar_apos ? String(row.tentar_apos) : null,
        reservationStartedAt: row.reservation_started_at
          ? String(row.reservation_started_at)
          : null,
      };
    },

    async findById(id) {
      const { data, error } = await supabase.from(TABLE).select("*").eq("id", id).maybeSingle();
      if (error) throw new GenerationRepositoryError("Falha ao consultar o comentário reservado.");
      return data as LegisBotComentario | null;
    },

    async complete(id, reservationStartedAt, comment, model) {
      const { data, error } = await supabase
        .from(TABLE)
        .update({
          comentario: comment,
          status: "concluido",
          modelo_ia: model,
          processing_started_at: null,
          retry_after: null,
          last_error_category: null,
        })
        .eq("id", id)
        .eq("status", "processando")
        .eq("processing_started_at", reservationStartedAt)
        .select("*")
        .maybeSingle();
      if (error) throw new GenerationRepositoryError("Falha ao salvar o comentário.");
      return data as LegisBotComentario | null;
    },

    async fail(id, reservationStartedAt, category) {
      const { error } = await supabase
        .from(TABLE)
        .update({
          status: "erro",
          processing_started_at: null,
          retry_after: new Date(Date.now() + 10 * 60_000).toISOString(),
          last_error_category: category.slice(0, 100),
        })
        .eq("id", id)
        .eq("status", "processando")
        .eq("processing_started_at", reservationStartedAt);
      if (error) throw new GenerationRepositoryError("Falha ao registrar o erro da geração.");
    },
  };
}
