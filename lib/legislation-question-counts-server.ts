import "server-only";

import { isOfflineBuild } from "@/lib/build-mode";
import { activeQuestionCountsBySlug } from "@/lib/question-counts-server";
import { usesUnifiedStagingQuestions } from "@/lib/unified-questions-staging-server";
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

  const slugs = legislacoes
    .map((legislacao) => legislacao.slug)
    // Staging é uma fonte de transição privada; páginas públicas não devem
    // tentar conectá-la em ambientes onde ela não foi configurada.
    .filter((slug) => usesUnifiedStagingQuestions(slug)
      ? Boolean(process.env.STAGING_DATABASE_URL)
      : Boolean(process.env.QUESTOES_SUPABASE_URL && process.env.QUESTOES_SUPABASE_SECRET_KEY));
  const counts = await activeQuestionCountsBySlug(slugs);
  return legislacoes.map((legislacao) => ({
    ...legislacao,
    quantidadeFlashcards: counts.get(legislacao.slug) ?? 0,
  }));
}
