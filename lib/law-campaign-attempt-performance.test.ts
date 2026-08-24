import { describe, expect, it } from "vitest";

import { campaignAttemptPerformance } from "@/lib/law-campaign-attempt-performance";

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
