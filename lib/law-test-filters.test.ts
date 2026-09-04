import { describe, expect, it } from "vitest";
import { filterTestQuestionIds, testEmptyMessage } from "./law-test-filters";

describe("filtros do Teste", () => {
  const universe = ["a", "b", "c", "new"];
  const current = [{ questionId: "a", correct: true }, { questionId: "b", correct: false }];
  it("mantém todas as questões autorizadas, inclusive em recorte já filtrado", () => expect(filterTestQuestionIds(["a", "c"], current, "all")).toEqual(["a", "c"]));
  it("usa somente erros da campanha de referência", () => expect(filterTestQuestionIds(universe, current, "wrong")).toEqual(["b"]));
  it("inclui não respondidas e questões novas", () => expect(filterTestQuestionIds(universe, current, "unanswered")).toEqual(["c", "new"]));
  it("após reset, uma referência sem respostas não carrega respostas antigas", () => expect(filterTestQuestionIds(universe, [], "wrong")).toEqual([]));
  it("expõe mensagens claras para conjuntos vazios", () => { expect(testEmptyMessage("wrong")).toBe("Nenhuma questão errada nesta campanha."); expect(testEmptyMessage("unanswered")).toBe("Você já respondeu todas as questões desta campanha."); });
});
