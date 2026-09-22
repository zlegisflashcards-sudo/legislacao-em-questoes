import { describe, expect, it } from "vitest";
import { availableLawStudyAccess } from "./law-question-scope-context";
import { collectPages } from "./law-question-pagination";

describe("contextos comerciais de estudo por lei", () => {
  it("percorre todas as páginas de questões, mesmo quando a fonte limita a resposta", async () => {
    const questions = Array.from({ length: 590 }, (_, index) => index + 1);
    const pages: Array<[number, number]> = [];
    const result = await collectPages(async (from, to) => {
      pages.push([from, to]);
      return questions.slice(from, to + 1);
    }, 200);
    expect(result).toHaveLength(590);
    expect(pages).toEqual([[0, 199], [200, 399], [400, 599]]);
  });

  it("reconhece uma única lei completa", () => {
    expect(availableLawStudyAccess([{ produto_id: "produto-completo" }], [{ produto_id: "produto-completo", recorte_id: null }])).toEqual({ full: true, recorteIds: [] });
  });
  it("mantém um único recorte sem ampliar o acesso", () => {
    expect(availableLawStudyAccess([{ produto_id: "produto-a" }], [{ produto_id: "produto-a", recorte_id: "pmsp" }])).toEqual({ full: false, recorteIds: ["pmsp"] });
  });
  it("preserva lei completa e recortes como opções distintas", () => {
    expect(availableLawStudyAccess([{ produto_id: "produto-a" }, { produto_id: "produto-b" }], [{ produto_id: "produto-a", recorte_id: null }, { produto_id: "produto-b", recorte_id: "pmerj" }])).toEqual({ full: true, recorteIds: ["pmerj"] });
  });
  it("não soma dois recortes como lei completa", () => {
    expect(availableLawStudyAccess([{ produto_id: "produto-a" }, { produto_id: "produto-b" }], [{ produto_id: "produto-a", recorte_id: "pmsp" }, { produto_id: "produto-b", recorte_id: "pmerj" }])).toEqual({ full: false, recorteIds: ["pmsp", "pmerj"] });
  });
  it("deduplica o mesmo recorte vindo de dois produtos", () => {
    expect(availableLawStudyAccess([{ produto_id: "produto-a" }, { produto_id: "produto-b" }], [{ produto_id: "produto-a", recorte_id: "pmsp" }, { produto_id: "produto-b", recorte_id: "pmsp" }])).toEqual({ full: false, recorteIds: ["pmsp"] });
  });
  it("reconhece liberação manual sem produto como lei completa", () => {
    expect(availableLawStudyAccess([{ produto_id: null }], [])).toEqual({ full: true, recorteIds: [] });
  });
});
