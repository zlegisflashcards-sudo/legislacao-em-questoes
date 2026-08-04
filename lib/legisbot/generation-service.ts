import type { LegisBotComentario } from "@/lib/legisbot-comentario";
import {
  gerarComentarioLegisBot,
  LEGISBOT_OPENAI_MODEL,
  OpenAIServiceError,
} from "./generate-comment";
import type { DetalhesErroOpenAI } from "./openai-error";
import { sanitizarComentarioHtml } from "./sanitize-comment-html";
import type { LegisBotGenerationInput, LegisBotIdentifiers } from "./request-validation";
import type { LegisBotGenerationRepository } from "./generation-repository-types";

export type GenerationOutcome =
  | { kind: "generated" | "completed"; item: LegisBotComentario; comment: string }
  | { kind: "processing"; retryAfter: string | null }
  | { kind: "rate_limited" | "cooldown"; retryAfter: string | null }
  | { kind: "attempts_exhausted" }
  | { kind: "quota" }
  | { kind: "temporary_failure" | "failure" };

type GenerationDependencies = {
  repository: LegisBotGenerationRepository;
  generate?: typeof gerarComentarioLegisBot;
  alertQuota?: (
    context: { slug: string; ordem: string; titulo?: string; assunto?: string },
    details: DetalhesErroOpenAI,
  ) => Promise<unknown>;
};

export async function requestLegisBotGeneration(
  dependencies: GenerationDependencies,
  userId: string,
  identifiers: LegisBotIdentifiers,
  input: LegisBotGenerationInput,
): Promise<GenerationOutcome> {
  const reservation = await dependencies.repository.reserve(userId, identifiers, input);

  if (reservation.decision === "rate_limited" || reservation.decision === "cooldown") {
    return { kind: reservation.decision, retryAfter: reservation.retryAfter };
  }
  if (reservation.decision === "attempts_exhausted") {
    return { kind: "attempts_exhausted" };
  }
  if (reservation.decision === "processing") {
    return { kind: "processing", retryAfter: reservation.retryAfter };
  }
  if (!reservation.commentId) throw new Error("Reserva sem identificador de comentário.");

  if (reservation.decision === "completed") {
    const item = await dependencies.repository.findById(reservation.commentId);
    if (!item || item.status !== "concluido" || !item.comentario?.trim()) {
      throw new Error("Comentário concluído não encontrado.");
    }
    return { kind: "completed", item, comment: sanitizarComentarioHtml(item.comentario) };
  }

  if (!reservation.reservationStartedAt) {
    throw new Error("Reserva sem token de lease.");
  }
  const item = await dependencies.repository.findById(reservation.commentId);
  if (!item) throw new Error("Comentário reservado não encontrado.");

  try {
    const generate = dependencies.generate ?? gerarComentarioLegisBot;
    const comment = sanitizarComentarioHtml(await generate({
      titulo: item.titulo,
      assunto: item.assunto,
      legislacao: item.legislacao,
    }));
    if (!comment.replace(/<[^>]*>/g, "").trim()) {
      throw new OpenAIServiceError({
        categoria: "internal",
        code: "empty_sanitized_response",
        type: "invalid_response",
        technicalMessage: "A resposta ficou vazia após a sanitização.",
      });
    }
    const saved = await dependencies.repository.complete(
      item.id,
      reservation.reservationStartedAt,
      comment,
      LEGISBOT_OPENAI_MODEL,
    );
    if (!saved) return { kind: "processing", retryAfter: null };
    return { kind: "generated", item: saved, comment };
  } catch (error) {
    const details: DetalhesErroOpenAI = error instanceof OpenAIServiceError
      ? error.details
      : {
          categoria: "internal",
          type: "generation_failure",
          technicalMessage: "Falha interna durante a geração.",
        };
    try {
      await dependencies.repository.fail(
        item.id,
        reservation.reservationStartedAt,
        details.categoria,
      );
    } catch {
      // A lease expira em dois minutos, mesmo se não for possível persistir a falha.
    }

    if (details.categoria === "quota") {
      if (dependencies.alertQuota) {
        try {
          await dependencies.alertQuota({
            slug: identifiers.slug,
            ordem: identifiers.ordem,
            titulo: item.titulo,
            assunto: item.assunto,
          }, details);
        } catch {
          // O alerta é secundário e não altera o estado seguro da geração.
        }
      }
      return { kind: "quota" };
    }
    if (error instanceof OpenAIServiceError && error.temporario) {
      return { kind: "temporary_failure" };
    }
    return { kind: "failure" };
  }
}
