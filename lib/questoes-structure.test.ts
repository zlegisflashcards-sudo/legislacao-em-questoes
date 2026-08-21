import { describe, expect, it } from "vitest";
import { compareQuestionStructureNames, inferQuestionStructureType, planQuestionDeckStructure } from "./questoes-structure";

describe("estrutura dos decks de questões", () => {
  it("infere título, capítulo, seção e subseção sem alterar o nome", () => {
    expect(inferQuestionStructureType("TÍTULO I — Geral")).toBe("titulo");
    expect(inferQuestionStructureType("Capítulo 02 — Regras")).toBe("capitulo");
    expect(inferQuestionStructureType("SEÇÃO III")).toBe("secao");
    expect(inferQuestionStructureType("Subseção única")).toBe("subsecao");
    expect(inferQuestionStructureType("Tema livre")).toBeNull();
  });

  it("planeja uma árvore até subseção e aponta a questão ao nó mais específico", () => {
    const plan = planQuestionDeckStructure([{ line: 4, deck: ["Lei X", "Título I", "Capítulo 02", "Seção III", "Subseção I"] }], []);
    expect(plan.decks).toEqual([{ line: 4, structureKey: plan.nodes[3].key, error: null }]);
    expect(plan.nodes.map((node) => node.tipo)).toEqual(["titulo", "capitulo", "secao", "subsecao"]);
  });

  it("aceita capítulo na raiz, reutiliza o nó equivalente e não duplica em reimportação", () => {
    const existing = [{ id: 10, parent_id: null, tipo: "capitulo" as const, nome: "Capítulo 06 – Serviço" }];
    const plan = planQuestionDeckStructure([{ line: 4, deck: ["Lei X", "  CAPÍTULO 06 –   Serviço "] }, { line: 5, deck: ["Lei X", "Capítulo 06 – Serviço"] }], existing);
    expect(plan.nodes).toHaveLength(1);
    expect(plan.nodes[0].existingId).toBe(10);
    expect(plan.decks.every((deck) => deck.error === null && deck.structureKey === plan.nodes[0].key)).toBe(true);
  });

  it("mantém nomes iguais em pais diferentes e rejeita hierarquia impossível", () => {
    const valid = planQuestionDeckStructure([{ line: 4, deck: ["Lei X", "Capítulo 01", "Seção I"] }, { line: 5, deck: ["Lei X", "Capítulo 02", "Seção I"] }], []);
    expect(valid.nodes.filter((node) => node.nome === "Seção I")).toHaveLength(2);
    const invalid = planQuestionDeckStructure([{ line: 6, deck: ["Lei X", "Seção I"] }, { line: 7, deck: ["Lei X", "Capítulo 01", "Tema"] }], []);
    expect(invalid.decks.map((deck) => deck.error)).toEqual(["Hierarquia estrutural inválida em “Seção I”.", "Tipo estrutural não reconhecido em “Tema”."]);
  });

  it("ordena nomes naturalmente", () => {
    expect([{ nome: "Capítulo 10" }, { nome: "Capítulo 2" }, { nome: "Capítulo 1" }].sort(compareQuestionStructureNames).map((item) => item.nome)).toEqual(["Capítulo 1", "Capítulo 2", "Capítulo 10"]);
  });
});
