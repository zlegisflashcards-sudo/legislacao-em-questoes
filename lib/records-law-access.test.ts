import { describe, expect, it } from "vitest";
import { recordsStudyHref } from "./records-law-access";

describe("destino de estudo no Records", () => {
  it("abre lei integral quando disponível, inclusive gratuita", () => {
    expect(recordsStudyHref("lei", [{ recorteId: "recorte" }, { recorteId: null }])).toBe("/estudar/lei/lei");
  });
  it("prioriza o recorte pronto vinculado ao concurso", () => {
    expect(recordsStudyHref("lei", [{ recorteId: null }, { recorteId: "edital" }], "edital")).toBe("/estudar/lei/lei?recorte_id=edital");
  });
  it("não apresenta recorte em breve como pronto", () => {
    expect(recordsStudyHref("lei", [{ recorteId: null }, { recorteId: "edital", availability: "coming_soon" }], "edital")).toBe("/estudar/lei/lei");
  });
  it("preserva recorte sem transformá-lo em lei integral", () => {
    expect(recordsStudyHref("lei", [{ recorteId: "id/1" }])).toBe("/estudar/lei/lei?recorte_id=id%2F1");
  });
  it("não oferece estudo sem contexto autorizado", () => {
    expect(recordsStudyHref("lei", [])).toBeNull();
  });
});
