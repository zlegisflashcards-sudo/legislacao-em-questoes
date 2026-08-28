import { describe, expect, it } from "vitest";

import { campaignScore } from "@/lib/law-campaign-score";

describe("score canônico da campanha", () => {
  it.each([
    [1, 0, 5], [2, 0, 10], [2, 1, 9], [0, 1, 0], [10, 0, 50], [10, 2, 48], [10, 5, 45], [250, 50, 1200],
  ])("calcula %i acertos e %i erros como %i", (correct, errors, expected) => {
    expect(campaignScore(correct, errors)).toBe(expected);
  });

  it("nunca fica negativo", () => {
    expect(campaignScore(0, 100)).toBe(0);
  });
});
