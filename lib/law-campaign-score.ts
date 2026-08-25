/**
 * Pontuação canônica de uma tentativa de Estudo Ativo.
 *
 * A campanha persiste o total de erros, enquanto cada questão do snapshot só
 * conclui depois de ser acertada. Por isso, os acertos pontuáveis são o total
 * do snapshot menos as tentativas erradas, nunca a quantidade atual de
 * questões cadastradas para a lei.
 */
export function campaignScore(totalSnapshotQuestions: number, totalErrors: number) {
  const total = Math.max(0, Math.trunc(totalSnapshotQuestions));
  if (!total) return 0;

  const errors = Math.max(0, Math.trunc(totalErrors));
  const correct = Math.max(0, total - errors);
  return Math.min(10000, Math.max(0, Math.round(correct / total * 10000)));
}
