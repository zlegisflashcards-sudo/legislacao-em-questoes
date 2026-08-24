import { describe, expect, it } from "vitest";

import { personalRecordForAttempt } from "@/lib/law-campaign-personal-record";

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
});
