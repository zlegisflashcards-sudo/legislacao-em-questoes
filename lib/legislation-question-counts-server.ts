import "server-only";

import { isOfflineBuild } from "@/lib/build-mode";
import { activeQuestionCountsBySlug } from "@/lib/question-counts-server";
import type { Legislacao } from "@/lib/legislacoes";

/**
 * Substitui o número editorial do catálogo pela contagem real de questões ativas.
 * O catálogo continua sendo a fonte de metadados públicos; a tabela `questions`
 * é a única fonte da quantidade de flashcards.
 */
export async function withActiveQuestionCounts(legislacoes: Legislacao[]) {
  // O build offline não possui conexão com as fontes de questões; nunca volte
  // a exibir o número editorial/manual nessa condição.
  if (isOfflineBuild()) {
    return legislacoes.map((legislacao) => ({ ...legislacao, quantidadeFlashcards: 0 }));
  }

  const slugs = legislacoes.map((legislacao) => legislacao.slug);
  const counts = await activeQuestionCountsBySlug(slugs);
  return legislacoes.map((legislacao) => ({
    ...legislacao,
    quantidadeFlashcards: counts.get(legislacao.slug) ?? 0,
  }));
}
