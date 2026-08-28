import { describe, expect, it } from "vitest";
import { descendantsForScope, questionsInScope } from "./law-question-scope-resolution";

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
});
