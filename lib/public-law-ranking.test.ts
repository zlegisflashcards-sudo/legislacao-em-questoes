import { describe, expect, it } from "vitest";
import { rankCompletedLawCampaigns } from "./public-law-ranking";

describe("ranking público por lei", () => {
  it("mantém somente o melhor resultado de cada aluno e aplica o desempate oficial", () => {
    const ranked = rankCompletedLawCampaigns([
      { aluno_id: "legado", score: 10000, score_version: 1, score_competitivo_atualizado_em: null },
      { aluno_id: "b", score: 9, score_version: 2, score_competitivo_atualizado_em: "2026-01-03T00:00:00Z" },
      { aluno_id: "a", score: 9, score_version: 2, score_competitivo_atualizado_em: "2026-01-02T00:00:00Z" },
      { aluno_id: "c", score: 10, score_version: 2, score_competitivo_atualizado_em: "2026-01-04T00:00:00Z" },
    ]);

    expect(ranked.map((entry) => [entry.studentId, entry.score])).toEqual([["c", 10], ["a", 9], ["b", 9]]);
  });
});
