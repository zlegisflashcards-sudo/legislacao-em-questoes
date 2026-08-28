import { describe, expect, it } from "vitest";

import { campaignAttemptPerformance, competitiveCampaignPerformance } from "@/lib/law-campaign-attempt-performance";

describe("aproveitamento da tentativa concluída", () => {
  it("calcula 80 acertos e 20 erros como 80%", () => {
    expect(campaignAttemptPerformance(80, 20)).toEqual({ correct: 80, errors: 20, totalAnswered: 100, accuracy: 80 });
  });

  it("trata uma tentativa sem erros", () => {
    expect(campaignAttemptPerformance(100, 0)).toEqual({ correct: 100, errors: 0, totalAnswered: 100, accuracy: 100 });
  });

  it("trata uma tentativa com somente erros antes dos acertos finais", () => {
    expect(campaignAttemptPerformance(0, 100)).toEqual({ correct: 0, errors: 100, totalAnswered: 100, accuracy: 0 });
  });

  it("evita divisão por zero", () => {
    expect(campaignAttemptPerformance(0, 0)).toEqual({ correct: 0, errors: 0, totalAnswered: 0, accuracy: 0 });
  });
});

describe("aproveitamento competitivo da campanha V2", () => {
  it("usa estado neutro antes da primeira resposta competitiva", () => {
    expect(competitiveCampaignPerformance(0, 0)).toEqual({ correct: 0, errors: 0, totalAnswered: 0, accuracy: 0 });
  });

  it("mostra 100% com um acerto competitivo", () => {
    expect(competitiveCampaignPerformance(1, 0)).toEqual({ correct: 1, errors: 0, totalAnswered: 1, accuracy: 100 });
  });

  it("mostra 50% com um acerto e um erro competitivos", () => {
    expect(competitiveCampaignPerformance(1, 1)).toEqual({ correct: 1, errors: 1, totalAnswered: 2, accuracy: 50 });
  });

  it("arredonda dois acertos e um erro competitivos para 67%", () => {
    expect(competitiveCampaignPerformance(2, 1)).toEqual({ correct: 2, errors: 1, totalAnswered: 3, accuracy: 67 });
  });
});
