import { describe, expect, it } from "vitest";
import { buildScopeTree, descendantsForScope, normalizeScopeSelection, questionsInScope, summarizeLawQuestionScopes } from "./law-question-scope-resolution";

const nodes = [
  { id: 1, parent_id: null }, { id: 2, parent_id: 1 }, { id: 3, parent_id: 2 }, { id: 4, parent_id: null }, { id: 5, parent_id: null },
];
const questions: Array<{ id: string; structure_id: number | null }> = [
  { id: "q1", structure_id: 1 }, { id: "q2", structure_id: 2 }, { id: "q3", structure_id: 3 }, { id: "q4", structure_id: 4 }, { id: "q5", structure_id: null },
];

describe("recortes de questões canônicas", () => {
  it("inclui um capítulo e todos os seus descendentes sem duplicar IDs", () => {
    const ids = descendantsForScope(nodes, [1, 2]);
    expect(ids.sort()).toEqual([1, 2, 3]);
    expect(questionsInScope(questions, ids).map((item) => item.id)).toEqual(["q1", "q2", "q3"]);
  });
  it("aceita artigos/nós específicos e exclui o conteúdo fora do recorte", () => {
    expect(questionsInScope(questions, descendantsForScope(nodes, [4])).map((item) => item.id)).toEqual(["q4"]);
  });
  it("reutiliza o mesmo registro canônico em recortes distintos", () => {
    const pmma = questionsInScope(questions, descendantsForScope(nodes, [1]));
    const cbmma = questionsInScope(questions, descendantsForScope(nodes, [2, 4]));
    expect(pmma.find((item) => item.id === "q2")).toBe(cbmma.find((item) => item.id === "q2"));
    expect(questions.filter((item) => item.id === "q2")).toHaveLength(1);
  });
  it("mantém a lei completa, inclusive questões sem structure_id", () => {
    expect(questionsInScope(questions, null).map((item) => item.id)).toEqual(["q1", "q2", "q3", "q4", "q5"]);
  });
  it("lista recortes ativos e inativos por consultas explícitas, sem embed ambíguo", () => {
    const scopes = summarizeLawQuestionScopes([
      { id: "ativo", ativo: true, nome: "Ativo" },
      { id: "inativo", ativo: false, nome: "Inativo" },
    ], [{ recorte_id: "ativo", structure_id: 4 }, { recorte_id: "inativo", structure_id: 1 }], nodes, questions);
    expect(scopes).toEqual([
      expect.objectContaining({ id: "ativo", ativo: true, structure_ids: [4], question_count: 1 }),
      expect.objectContaining({ id: "inativo", ativo: false, structure_ids: [1], question_count: 3 }),
    ]);
  });
  it("retorna lista vazia para lei sem recortes", () => {
    expect(summarizeLawQuestionScopes([], [], nodes, questions)).toEqual([]);
  });
  it("preserva títulos sem questões diretas como pais de capítulos da CF", () => {
    const cf = [
      { id: 20, parent_id: null, nome: "Título 02" }, { id: 21, parent_id: 20, nome: "Capítulo 01" },
      { id: 30, parent_id: null, nome: "Título 03" }, { id: 31, parent_id: 30, nome: "Capítulo 07" },
      { id: 40, parent_id: null, nome: "Título 04" }, { id: 41, parent_id: 40, nome: "Capítulo 03" }, { id: 42, parent_id: 41, nome: "Seção 08" },
      { id: 50, parent_id: null, nome: "Título 05" }, { id: 51, parent_id: 50, nome: "Capítulo 03" },
    ];
    const tree = buildScopeTree(cf);
    expect(tree.map((node) => node.id)).toEqual([20, 30, 40, 50]);
    expect(tree[0].children.map((node) => node.id)).toEqual([21]);
    expect(tree[1].children.map((node) => node.id)).toEqual([31]);
    expect(tree[2].children[0].children.map((node) => node.id)).toEqual([42]);
    expect(tree[3].children.map((node) => node.id)).toEqual([51]);
  });
  it("marca filhos como incluídos pelo pai e não persiste seleção redundante", () => {
    expect(normalizeScopeSelection(nodes, [1, 2, 3])).toEqual([1]);
    expect(descendantsForScope(nodes, normalizeScopeSelection(nodes, [1, 2, 3])).sort()).toEqual([1, 2, 3]);
  });
});
