import { describe, expect, it } from "vitest";
import { canConcludeLegislativeUpdate, legislationSignature, normalizeSupportingOrders } from "./article-legislative-update";

describe("atualização legislativa por artigo", () => {
  it("normaliza os vínculos de apoio sem alterar o dispositivo principal", () => {
    expect(normalizeSupportingOrders([{ slug: " L13022 ", ordem: "0002.0.00.0.00.0" }, { slug: "l13022", ordem: "0002.0.00.0.00.0" }, { slug: "", ordem: "x" }])).toEqual([{ slug: "l13022", ordem: "0002.0.00.0.00.0" }]);
  });
  it("vincula uma combinação à versão revisada da legislação", () => {
    expect(legislationSignature("<p>Art. 3º</p>")).not.toBe(legislationSignature("<p>Art. 2º e Art. 3º</p>"));
  });
  it("só permite concluir quando todas as quatro etapas terminarem", () => {
    expect(canConcludeLegislativeUpdate("em_revisao", ["legislacao", "questoes", "mapeamento"])).toBe(false);
    expect(canConcludeLegislativeUpdate("em_revisao", ["legislacao", "questoes", "mapeamento", "materiais"])).toBe(true);
  });
});
