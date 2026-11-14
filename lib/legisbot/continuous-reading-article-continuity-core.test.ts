import { describe, expect, it } from "vitest";
import { resolveContinuousReadingArticleContinuity } from "./continuous-reading-article-continuity-core";

describe("continuidade de artigos da leitura contínua", () => {
  it("olha somente o segmento de artigo e mantém parágrafos no mesmo artigo", () => {
    expect(resolveContinuousReadingArticleContinuity({ orders: ["0005.0.00.0.00.0", "0005.0.01.0.00.0", "0007.0.00.0.00.0"] })).toMatchObject({
      firstArticle: 5, lastArticle: 7, presentArticles: [5, 7], possibleMissingArticles: [6], confirmedMissingArticles: [],
    });
  });

  it("não inventa artigo com letra e só bloqueia lacuna documentada", () => {
    const result = resolveContinuousReadingArticleContinuity({
      orders: ["0002.a.00.0.00.0", "0004.0.00.0.00.0"],
      confirmedExpectedArticleNumbers: [3],
    });
    expect(result.presentArticles).toEqual([2, 4]);
    expect(result.possibleMissingArticles).toEqual([3]);
    expect(result.confirmedMissingArticles).toEqual([3]);
  });
});
