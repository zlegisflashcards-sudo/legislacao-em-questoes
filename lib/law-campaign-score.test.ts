import { describe, expect, it } from "vitest";

import { campaignScore } from "@/lib/law-campaign-score";

describe("score da campanha pelo snapshot", () => {
  it.each([
    [90, 9, 9000],
    [250, 25, 9000],
    [90, 1, 9889],
    [178, 1, 9944],
    [90, 0, 10000],
    [90, 90, 0],
  ])("calcula %i questões e %i erros como %i", (total, errors, expected) => {
    expect(campaignScore(total, errors)).toBe(expected);
  });

  it("normaliza o mesmo aproveitamento em snapshots de tamanhos diferentes", () => {
    expect(campaignScore(90, 9)).toBe(campaignScore(250, 25));
  });
});
