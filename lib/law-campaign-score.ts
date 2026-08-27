/**
 * Pontuação canônica de uma tentativa de Estudo Ativo.
 *
 * Cada resposta confirmada persiste seus dados brutos: acertos e erros.
 * Esta função é deliberadamente pequena para que a mesma regra seja usada no
 * banco, no fechamento e nos testes de recálculo.
 */
export function campaignScore(totalCorrect: number, totalErrors: number) {
  const correct = Math.max(0, Math.trunc(totalCorrect));
  const errors = Math.max(0, Math.trunc(totalErrors));
  return Math.max(0, correct * 5 - errors);
}
