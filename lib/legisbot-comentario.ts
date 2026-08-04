export const LEGISBOT_COMENTARIO_STATUS = [
  "pendente",
  "processando",
  "concluido",
  "erro",
] as const;

export type LegisBotComentarioStatus =
  (typeof LEGISBOT_COMENTARIO_STATUS)[number];

/** Representação da linha persistida em public.legisbot_comentarios. */
export interface LegisBotComentario {
  id: number;
  slug: string;
  ordem: string;
  titulo: string;
  assunto: string;
  legislacao: string;
  comentario: string | null;
  status: LegisBotComentarioStatus;
  modelo_ia: string | null;
  processing_started_at: string | null;
  retry_after: string | null;
  attempt_count: number;
  last_error_category: string | null;
  created_at: string;
  updated_at: string;
}

/** Dados aceitos ao registrar pela primeira vez um trecho da legislação. */
export type NovoLegisBotComentario = Pick<
  LegisBotComentario,
  "slug" | "ordem" | "titulo" | "assunto" | "legislacao"
>;
