import type { LegisBotComentario } from "../legisbot-comentario";
import type { LegisBotGenerationInput, LegisBotIdentifiers } from "./request-validation";

export type GenerationDecision =
  | "reserved"
  | "completed"
  | "processing"
  | "rate_limited"
  | "cooldown"
  | "attempts_exhausted";

export type GenerationReservation = {
  decision: GenerationDecision;
  commentId: number | null;
  retryAfter: string | null;
  reservationStartedAt: string | null;
};

export class GenerationRepositoryError extends Error {
  constructor(message: string, public readonly invalidInput = false) {
    super(message);
    this.name = "GenerationRepositoryError";
  }
}

export interface LegisBotGenerationRepository {
  reserve(
    userId: string,
    identifiers: LegisBotIdentifiers,
    input: LegisBotGenerationInput,
  ): Promise<GenerationReservation>;
  findById(id: number): Promise<LegisBotComentario | null>;
  complete(id: number, reservationStartedAt: string, comment: string, model: string): Promise<LegisBotComentario | null>;
  fail(id: number, reservationStartedAt: string, category: string): Promise<void>;
}
