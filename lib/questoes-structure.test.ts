import { describe, expect, it } from "vitest";
import { compareQuestionStructureNames, inferQuestionStructureType, parseQuestionStructureTxt, planQuestionDeckStructure, validQuestionStructureParent } from "./questoes-structure";

describe("estrutura dos decks de questões", () => {
  it("infere todos os níveis legislativos sem alterar a numeração oficial no nome", () => {
    expect(inferQuestionStructureType("PARTE GERAL")).toBe("parte");
    expect(inferQuestionStructureType("Livro I — Das pessoas")).toBe("livro");
    expect(inferQuestionStructureType("TÍTULO I — Geral")).toBe("titulo");
    expect(inferQuestionStructureType("Capítulo 02 — Regras")).toBe("capitulo");
    expect(inferQuestionStructureType("SEÇÃO III")).toBe("secao");
    expect(inferQuestionStructureType("Subseção única")).toBe("subsecao");
    expect(inferQuestionStructureType("Tema livre")).toBeNull();
  });

  it("aceita o Código Penal com Parte Geral seguida diretamente por Título", () => {
    const plan = planQuestionDeckStructure([{ line: 4, deck: ["Código Penal", "PARTE GERAL", "TÍTULO I — DA APLICAÇÃO DA LEI PENAL"] }], []);
    expect(plan.decks).toEqual([{ line: 4, structureKey: plan.nodes[1].key, error: null }]);
    expect(plan.nodes.map((node) => [node.tipo, node.nome])).toEqual([["parte", "PARTE GERAL"], ["titulo", "TÍTULO I — DA APLICAÇÃO DA LEI PENAL"]]);
  });

  it("aceita qualquer nível na raiz ou dentro de um nível superior compatível", () => {
    expect(validQuestionStructureParent("parte", null)).toBe(true);
    expect(validQuestionStructureParent("livro", null)).toBe(true);
    expect(validQuestionStructureParent("titulo", null)).toBe(true);
    expect(validQuestionStructureParent("secao", null)).toBe(true);
    expect(validQuestionStructureParent("livro", "parte")).toBe(true);
    expect(validQuestionStructureParent("titulo", "parte")).toBe(true);
    expect(validQuestionStructureParent("capitulo", "titulo")).toBe(true);
    expect(validQuestionStructureParent("secao", "titulo")).toBe(true);
    expect(validQuestionStructureParent("subsecao", "capitulo")).toBe(true);
    expect(validQuestionStructureParent("titulo", "capitulo")).toBe(false);
    expect(validQuestionStructureParent("parte", "livro")).toBe(false);
    expect(validQuestionStructureParent("capitulo", "capitulo")).toBe(false);
    expect(validQuestionStructureParent("titulo", "artigo")).toBe(false);
  });

  it("não usa limite fixo de segmentos e preserva a hierarquia completa", () => {
    const parsed = parseQuestionStructureTxt("PARTE GERAL::LIVRO I::TÍTULO I::CAPÍTULO I::SEÇÃO I::SUBSEÇÃO I");
    expect(parsed.issues).toEqual([]);
    const plan = planQuestionDeckStructure(parsed.rows, []);
    expect(plan.nodes.map((node) => node.tipo)).toEqual(["parte", "livro", "titulo", "capitulo", "secao", "subsecao"]);
    expect(plan.decks[0].error).toBeNull();
  });

  it("mantém nomes iguais em pais diferentes e rejeita hierarquia impossível", () => {
    const valid = planQuestionDeckStructure([{ line: 4, deck: ["Lei X", "Capítulo 01", "Seção I"] }, { line: 5, deck: ["Lei X", "Capítulo 02", "Seção I"] }], []);
    expect(valid.nodes.filter((node) => node.nome === "Seção I")).toHaveLength(2);
    const invalid = planQuestionDeckStructure([{ line: 6, deck: ["Lei X", "Título I", "Parte Geral"] }, { line: 7, deck: ["Lei X", "Capítulo 01", "Tema"] }], []);
    expect(invalid.decks.map((deck) => deck.error)).toEqual(["Hierarquia estrutural inválida em “Parte Geral”.", "Tipo estrutural não reconhecido em “Tema”."]);
  });

  it("ordena primeiro pela posição numérica e depois pelo nome natural", () => {
    expect([{ nome: "Capítulo 10", ordem: 2 }, { nome: "Capítulo 2", ordem: 1 }, { nome: "Capítulo 1", ordem: 1 }].sort(compareQuestionStructureNames).map((item) => item.nome)).toEqual(["Capítulo 1", "Capítulo 2", "Capítulo 10"]);
  });

  it("mantém a ordem de primeira aparição e detecta duplicidade normalizada", () => {
    const parsed = parseQuestionStructureTxt("TÍTULO II\nTÍTULO I\n  título ii  ");
    expect(parsed.rows.map((row) => row.deck.at(-1))).toEqual(["TÍTULO II", "TÍTULO I"]);
    expect(parsed.issues).toEqual([{ line: 3, path: "título ii", message: "Caminho duplicado; ele já foi informado na linha 1." }]);
  });

  it("preserva nós existentes e não os duplica em reimportação", () => {
    const parsed = parseQuestionStructureTxt("PARTE GERAL::TÍTULO I\nPARTE GERAL::TÍTULO I::CAPÍTULO I");
    const existing = [{ id: 1, parent_id: null, tipo: "parte" as const, nome: "Parte Geral" }, { id: 2, parent_id: 1, tipo: "titulo" as const, nome: "Título I" }, { id: 3, parent_id: 2, tipo: "capitulo" as const, nome: "Capítulo I" }];
    const plan = planQuestionDeckStructure(parsed.rows, existing);
    expect(plan.nodes.map((node) => node.existingId)).toEqual([1, 2, 3]);
    expect(plan.nodes).toHaveLength(3);
  });

  it("rejeita nível vazio sem alterar o restante do TXT", () => {
    const parsed = parseQuestionStructureTxt("TÍTULO I::::CAPÍTULO I\nTÍTULO I::CAPÍTULO I");
    expect(parsed.issues).toEqual([{ line: 1, path: "TÍTULO I::::CAPÍTULO I", message: "O caminho possui um nível vazio." }]);
    expect(planQuestionDeckStructure(parsed.rows, []).decks[0].error).toBeNull();
  });
});
