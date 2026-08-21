import "server-only";

import { mainActiveQuestionCountsBySlug } from "@/lib/questions-main-server";

/** Fonte única de contagem: somente registros ativos da tabela de questões da fonte explícita da lei. */
export async function activeQuestionCountsBySlug(slugs: string[]) {
  return mainActiveQuestionCountsBySlug(slugs);
}

export async function activeQuestionCountBySlug(slug: string) {
  return (await activeQuestionCountsBySlug([slug])).get(slug) ?? 0;
}
