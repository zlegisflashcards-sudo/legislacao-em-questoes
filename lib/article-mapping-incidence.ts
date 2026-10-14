export type ArticleMappingIncidence = "muito_alta" | "alta" | "media" | "baixa" | "nao_mapeado";

/**
 * Prioridade inicial objetiva para contextos ainda sem decisão editorial.
 * Uma decisão salva na Central do Artigo sempre prevalece sobre este cálculo.
 */
export function incidenceFromQuestionCount(questionCount: number): ArticleMappingIncidence {
  if (!Number.isFinite(questionCount) || questionCount < 1) return "nao_mapeado";
  if (questionCount >= 10) return "muito_alta";
  if (questionCount >= 6) return "alta";
  if (questionCount >= 3) return "media";
  return "baixa";
}
