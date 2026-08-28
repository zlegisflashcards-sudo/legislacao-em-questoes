export type CampaignAttemptPerformance = {
  correct: number;
  errors: number;
  totalAnswered: number;
  accuracy: number;
};

/**
 * Uma campanha concluída só encerra quando cada questão do snapshot foi acertada.
 * `total_erros` registra todas as tentativas erradas, inclusive as da revisão.
 */
export function campaignAttemptPerformance(totalQuestions: number, totalErrors: number): CampaignAttemptPerformance {
  const correct = Math.max(0, totalQuestions);
  const errors = Math.max(0, totalErrors);
  const totalAnswered = correct + errors;
  return { correct, errors, totalAnswered, accuracy: totalAnswered ? Math.round(correct / totalAnswered * 100) : 0 };
}

/** Desempenho da janela competitiva V2, independente do histórico pedagógico. */
export function competitiveCampaignPerformance(totalCorrect: number, totalErrors: number): CampaignAttemptPerformance {
  const correct = Math.max(0, totalCorrect);
  const errors = Math.max(0, totalErrors);
  const totalAnswered = correct + errors;
  return { correct, errors, totalAnswered, accuracy: totalAnswered ? Math.round(correct / totalAnswered * 100) : 0 };
}
