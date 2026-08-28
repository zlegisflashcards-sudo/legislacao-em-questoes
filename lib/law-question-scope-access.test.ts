import { describe, expect, it } from "vitest";
import { availableLawStudyAccess } from "./law-question-scope-context";

describe("contextos comerciais de estudo por lei", () => {
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
