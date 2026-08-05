import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { headerActions, primaryNavigation } from "./site-navigation";

describe("cabeçalho único", () => {
  const labels = ["Catálogo", "LegisCast TV", "Liga das Leis", "Minhas leis adquiridas", "Meu perfil"];

  it("mantém os cinco itens e suas rotas reais", () => {
    expect(primaryNavigation.map((item) => item.label)).toEqual(labels);
    expect(primaryNavigation.map((item) => item.href)).toEqual([
      "/",
      "/legiscast",
      "/ranking-legis",
      "https://hotmart.com/pt-br/club/legislacao-em-flashcard",
      "/conta",
    ]);
  });

  it("mostra Entrar apenas para visitante", () => {
    expect(headerActions(false)).toEqual([{ label: "Entrar", href: "/conta?modo=login" }]);
    expect(headerActions(true)).toEqual([]);
    expect(primaryNavigation.some((item) => item.label === "Meu perfil")).toBe(true);
  });

  it("renderiza desktop e mobile a partir da mesma fonte de navegação", () => {
    const source = readFileSync("components/site-header.tsx", "utf8");
    expect(source.match(/primaryNavigation\.map/g)).toHaveLength(2);
    expect(source).toContain('aria-label="Navegação principal no celular"');
    expect(source).toContain("onSelect={closeMenu}");
    expect(source).toContain('event.key === "Escape"');
  });
});
