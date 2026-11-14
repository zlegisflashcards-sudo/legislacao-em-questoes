import { parseQuestionOrder } from "@/lib/question-structure-consistency";

export type ArticleContinuity = {
  firstArticle: number | null;
  lastArticle: number | null;
  presentArticles: number[];
  /** Saltos numéricos são avisos: artigos com letra podem justificar a lacuna. */
  possibleMissingArticles: number[];
  /** Só deve ser preenchido quando a fonte documental estiver atribuída ao recorte. */
  confirmedMissingArticles: number[];
};

/**
 * Confere apenas o nível do artigo da Ordem canônica. Parágrafos, incisos e
 * alíneas nunca geram lacunas nesta análise.
 */
export function resolveContinuousReadingArticleContinuity(input: {
  orders: readonly string[];
  confirmedExpectedArticleNumbers?: readonly number[];
}): ArticleContinuity {
  const presentArticles = [...new Set(input.orders
    .map((order) => parseQuestionOrder(order)?.artigo)
    .filter((article): article is string => Boolean(article))
    .map(Number)
    .filter((article) => Number.isSafeInteger(article) && article > 0))].sort((a, b) => a - b);
  if (!presentArticles.length) return { firstArticle: null, lastArticle: null, presentArticles: [], possibleMissingArticles: [], confirmedMissingArticles: [] };
  const firstArticle = presentArticles[0];
  const lastArticle = presentArticles[presentArticles.length - 1];
  const present = new Set(presentArticles);
  const possibleMissingArticles: number[] = [];
  for (let article = firstArticle; article <= lastArticle; article += 1) if (!present.has(article)) possibleMissingArticles.push(article);
  const expected = new Set((input.confirmedExpectedArticleNumbers ?? []).filter((article) => Number.isSafeInteger(article) && article > 0));
  return {
    firstArticle,
    lastArticle,
    presentArticles,
    possibleMissingArticles,
    confirmedMissingArticles: possibleMissingArticles.filter((article) => expected.has(article)),
  };
}
