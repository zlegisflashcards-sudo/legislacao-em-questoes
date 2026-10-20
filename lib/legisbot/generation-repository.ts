import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { LegisBotComentario } from "@/lib/legisbot-comentario";
import type { LegisBotIdentifiers } from "./request-validation";
import type { LegisBotSource } from "./source";
import { createLegisBotSourceSignature } from "./source";
import { legisBotOrderCandidates } from "./source";
import { legalHtmlToStructuredText } from "./sanitize-legal-html-core";
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

/** Busca apenas os registros já salvos, da Ordem exata até seus pais. */
export async function findHierarchicalLegisBotComment(
  supabase: SupabaseClient,
  identifiers: LegisBotIdentifiers,
  referenceId?: string,
): Promise<LegisBotComentario | null> {
  if (referenceId) {
    const linked = await supabase
      .from(TABLE)
      .select("*")
      .eq("reference_id", referenceId)
      .order("id")
      .limit(1)
      .maybeSingle();
    if (linked.error) throw new GenerationRepositoryError("Falha ao consultar o comentário vinculado.");
    if (linked.data) return linked.data as LegisBotComentario;
  }
  const candidates = legisBotOrderCandidates(identifiers.ordem);
  const { data, error } = await supabase
    .from(TABLE)
    .select("*")
    .eq("slug", identifiers.slug)
    .in("ordem", candidates);
  if (error) throw new GenerationRepositoryError("Falha ao consultar o comentário.");
  const byOrder = new Map((data ?? []).map((item) => [String(item.ordem), item as LegisBotComentario]));
  for (const ordem of candidates) {
    const item = byOrder.get(ordem);
    if (item?.status === "concluido" && item.comentario?.trim()) return item;
  }
  return null;
}

export async function reconcileLegisBotCommentSource(
  supabase: SupabaseClient,
  source: LegisBotSource,
): Promise<LegisBotComentario | null> {
  const current = await findLegisBotComment(supabase, source);
  if (!current) return null;
  const storedSignature = current.source_signature || createLegisBotSourceSignature({
    titulo: current.titulo,
    assunto: current.assunto,
    promptLegislacao: current.legislacao
      ? legalHtmlToStructuredText(current.legislacao)
      : source.promptLegislacao,
  });
  const precisaRevisao = storedSignature !== source.signature;
  if (current.source_signature === storedSignature && current.precisa_revisao === precisaRevisao) return current;
  const { data, error } = await supabase
    .from(TABLE)
    .update({ source_signature: storedSignature, precisa_revisao: precisaRevisao })
    .eq("id", current.id)
    .select("*")
    .single();
  if (error) throw new GenerationRepositoryError("Falha ao reconciliar a fonte do comentário.");
  return data as LegisBotComentario;
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
        p_reference_id: input.referenceId,
        p_titulo: input.titulo,
        p_assunto: input.assunto,
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

    async complete(id, reservationStartedAt, comment, model, sourceSignature) {
      const { data, error } = await supabase
        .from(TABLE)
        .update({
          comentario: comment,
          status: "concluido",
          modelo_ia: model,
          processing_started_at: null,
          retry_after: null,
          last_error_category: null,
          source_signature: sourceSignature,
          precisa_revisao: false,
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
