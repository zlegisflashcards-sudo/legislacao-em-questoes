import { describe, expect, it } from "vitest";
import { freeStudyLoginHref } from "./free-study-access";

describe("acesso ao estudo gratuito", () => {
  it("preserva um destino interno, inclusive o contexto de recorte", () => {
    const href = new URL(freeStudyLoginHref("/estudar/lei/cf?recorte_id=recorte-1"), "https://legisflashcards.local");
    expect(href.pathname).toBe("/conta");
    expect(href.searchParams.get("modo")).toBe("login");
    expect(href.searchParams.get("gratis")).toBe("1");
    expect(href.searchParams.get("retorno")).toBe("/estudar/lei/cf?recorte_id=recorte-1");
  });

  it("descarta um destino externo antes de montar o login", () => {
    const href = new URL(freeStudyLoginHref("https://example.com"), "https://legisflashcards.local");
    expect(href.searchParams.get("retorno")).toBe("/minhas-leis");
  });
});
