import { describe, expect, it } from "vitest";

import { bestCompletedCampaignForRecord, personalRecordForAttempt } from "@/lib/law-campaign-personal-record";

describe("recorde pessoal da campanha", () => {
  it("registra a primeira tentativa concluída como primeiro recorde", () => {
    expect(personalRecordForAttempt(9200, [])).toEqual({ previousBest: null, currentBest: 9200, status: "first_record" });
  });

  it("reconhece quando a nova tentativa supera o recorde anterior", () => {
    expect(personalRecordForAttempt(9300, [{ score: 9200 }])).toEqual({ previousBest: 9200, currentBest: 9300, status: "new_record" });
  });

  it("mantém o recorde quando a tentativa é inferior", () => {
    expect(personalRecordForAttempt(8900, [{ score: 9200 }])).toEqual({ previousBest: 9200, currentBest: 9200, status: "record_remains" });
  });

  it("informa empate com o recorde anterior", () => {
    expect(personalRecordForAttempt(9200, [{ score: 9200 }])).toEqual({ previousBest: 9200, currentBest: 9200, status: "matched_record" });
  });

  it("usa o score ajustado administrativamente no histórico", () => {
    expect(personalRecordForAttempt(9400, [{ score: 9200, score_ajustado: 9500 }])).toEqual({ previousBest: 9500, currentBest: 9500, status: "record_remains" });
  });

  it("mantém a campanha do recorde quando uma tentativa posterior é inferior", () => {
    expect(bestCompletedCampaignForRecord([
      { id: "recorde", score: 9500, concluida_em: "2026-08-10T10:00:00.000Z", total_erros: 5 },
      { id: "recente", score: 9100, concluida_em: "2026-08-11T10:00:00.000Z", total_erros: 9 },
    ])?.id).toBe("recorde");
  });

  it("desempata o recorde pela conclusão mais antiga e depois pelo ID", () => {
    expect(bestCompletedCampaignForRecord([
      { id: "b", score: 9500, concluida_em: "2026-08-11T10:00:00.000Z", total_erros: 5 },
      { id: "a", score: 9500, concluida_em: "2026-08-10T10:00:00.000Z", total_erros: 6 },
    ])?.id).toBe("a");
  });
});
