import { describe, expect, it } from "vitest";
import { compareQuestionStructureNames, inferQuestionStructureType, parseQuestionStructureTxt, planQuestionDeckStructure, validQuestionStructureParent } from "./questoes-structure";

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

  it("aceita somente a hierarquia usada pela árvore administrativa e pelo importador", () => {
    expect(validQuestionStructureParent("titulo", null)).toBe(true);
    expect(validQuestionStructureParent("capitulo", null)).toBe(true);
    expect(validQuestionStructureParent("capitulo", "titulo")).toBe(true);
    expect(validQuestionStructureParent("secao", "capitulo")).toBe(true);
    expect(validQuestionStructureParent("subsecao", "secao")).toBe(true);

    expect(validQuestionStructureParent("titulo", "capitulo")).toBe(false);
    expect(validQuestionStructureParent("secao", null)).toBe(false);
    expect(validQuestionStructureParent("secao", "titulo")).toBe(false);
    expect(validQuestionStructureParent("subsecao", "titulo")).toBe(false);
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

  it("converte TXT simples e hierárquico no mesmo formato de decks do Anki", () => {
    const parsed = parseQuestionStructureTxt("TÍTULO I\nTÍTULO I::CAPÍTULO I\nTÍTULO I::CAPÍTULO I::SEÇÃO I");
    expect(parsed.issues).toEqual([]);
    const plan = planQuestionDeckStructure(parsed.rows, []);
    expect(plan.nodes.map((node) => [node.tipo, node.path])).toEqual([
      ["titulo", "TÍTULO I"],
      ["capitulo", "TÍTULO I › CAPÍTULO I"],
      ["secao", "TÍTULO I › CAPÍTULO I › SEÇÃO I"],
    ]);
    expect(plan.decks.every((item) => item.error === null)).toBe(true);
  });

  it("mantém a ordem de primeira aparição e detecta duplicidade normalizada", () => {
    const parsed = parseQuestionStructureTxt("TÍTULO II\nTÍTULO I\n  título ii  ");
    expect(parsed.rows.map((row) => row.deck.at(-1))).toEqual(["TÍTULO II", "TÍTULO I"]);
    expect(parsed.issues).toEqual([{ line: 3, path: "título ii", message: "Caminho duplicado; ele já foi informado na linha 1." }]);
  });

  it("rejeita nível vazio, profundidade não suportada e hierarquia inválida", () => {
    const parsed = parseQuestionStructureTxt("TÍTULO I::::CAPÍTULO I\nTÍTULO I::CAPÍTULO I::SEÇÃO I::SUBSEÇÃO I::CAPÍTULO II\nSEÇÃO I");
    expect(parsed.issues).toHaveLength(2);
    const plan = planQuestionDeckStructure(parsed.rows, []);
    expect(plan.decks[0].error).toBe("Hierarquia estrutural inválida em “SEÇÃO I”.");
  });

  it("preserva nós existentes e não os duplica", () => {
    const parsed = parseQuestionStructureTxt("TÍTULO I::CAPÍTULO I");
    const existing = [
      { id: 1, parent_id: null, tipo: "titulo" as const, nome: "Título I" },
      { id: 2, parent_id: 1, tipo: "capitulo" as const, nome: "Capítulo I" },
    ];
    const plan = planQuestionDeckStructure(parsed.rows, existing);
    expect(plan.nodes.map((node) => node.existingId)).toEqual([1, 2]);
  });
});
