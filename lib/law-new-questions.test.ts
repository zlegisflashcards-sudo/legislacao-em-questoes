import { describe, expect, it } from "vitest";
import { newQuestionCountsByStructure } from "./law-new-questions";

describe("questões novas por bloco", () => {
  const structure = [{ id: 1, parentId: null }];
  const before = "2026-01-01T00:00:00.000Z";
  const after = "2026-02-01T00:00:00.000Z";

  it("mostra somente questões cadastradas depois do marco do aluno e ainda pendentes", () => {
    const questions = ["a", "b", "c", "d"].map((id, index) => ({ id, structureId: 1, createdAt: index < 2 ? before : after }));
    expect(newQuestionCountsByStructure(structure, questions, [{ questionId: "a", answeredAt: "2026-01-15T00:00:00.000Z" }]).get(1)).toBe(2);
    expect(newQuestionCountsByStructure(structure, questions, [{ questionId: "a", answeredAt: "2026-01-15T00:00:00.000Z" }, { questionId: "c", answeredAt: "2026-03-01T00:00:00.000Z" }, { questionId: "d", answeredAt: "2026-03-01T00:00:01.000Z" }]).get(1)).toBe(0);
  });

  it("não chama de novas as questões de um bloco que o aluno nunca respondeu", () => {
    expect(newQuestionCountsByStructure(structure, [{ id: "a", structureId: 1, createdAt: after }], []).get(1)).toBe(0);
  });
});
