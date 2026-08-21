import { describe, expect, it } from "vitest";
import { rankCompletedLawCampaigns } from "./public-law-ranking";

describe("ranking público por lei", () => {
  it("mantém somente o melhor resultado de cada aluno e aplica o desempate oficial", () => {
    const ranked = rankCompletedLawCampaigns([
      { aluno_id: "b", score: 9700, concluida_em: "2026-01-03T00:00:00Z" },
      { aluno_id: "a", score: 9700, concluida_em: "2026-01-02T00:00:00Z" },
      { aluno_id: "a", score: 9500, concluida_em: "2026-01-01T00:00:00Z" },
      { aluno_id: "c", score: 9800, concluida_em: "2026-01-04T00:00:00Z" },
    ]);

    expect(ranked.map((entry) => [entry.studentId, entry.score])).toEqual([["c", 9800], ["a", 9700], ["b", 9700]]);
  });
});
