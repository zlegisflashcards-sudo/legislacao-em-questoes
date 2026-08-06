import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { headerActions, headerNavigation } from "./site-navigation";

describe("cabeçalho único", () => {
  const publicLabels = ["Catálogo", "LegisCast TV", "Liga das Leis", "Minhas leis adquiridas"];

  it("mantém os links públicos e oculta o perfil sem autenticação", () => {
    expect(headerNavigation(null).map((item) => item.label)).toEqual(publicLabels);
    expect(headerNavigation(false).map((item) => item.label)).toEqual(publicLabels);
    expect(headerNavigation(false).map((item) => item.href)).toEqual([
      "/",
      "/legiscast",
      "/ranking-legis",
      "/conta?modo=login&retorno=%2Fminhas-leis",
    ]);
  });

  it("mostra perfil e painel somente para usuário autenticado", () => {
    expect(headerNavigation(true).map((item) => item.label)).toEqual([...publicLabels, "Meu perfil"]);
    expect(headerNavigation(true).find((item) => item.label === "Minhas leis adquiridas")).toEqual({
      label: "Minhas leis adquiridas",
      href: "/minhas-leis",
    });
    expect(headerNavigation(true).at(-1)).toEqual({ label: "Meu perfil", href: "/conta" });
    expect(headerActions(true)).toEqual([{ label: "Meu painel", href: "/dashboard" }]);
    expect(headerActions(true).some((item) => item.label === "Entrar")).toBe(false);
  });

  it("mostra Entrar para visitante com retorno seguro ao dashboard", () => {
    expect(headerActions(null)).toEqual([]);
    expect(headerActions(false)).toEqual([
      { label: "Entrar", href: "/conta?modo=login&retorno=%2Fdashboard" },
    ]);
    expect(headerNavigation(false).some((item) => item.label === "Meu perfil")).toBe(false);
    expect(headerActions(false).some((item) => item.label === "Meu painel")).toBe(false);
  });

  it("renderiza desktop e mobile a partir das mesmas fontes", () => {
    const source = readFileSync("components/site-header.tsx", "utf8");
    expect(source.match(/navigation\.map/g)).toHaveLength(2);
    expect(source.match(/actions\.map/g)).toHaveLength(2);
    expect(source).toContain('aria-label="Navegação principal no celular"');
    expect(source).toContain("onSelect={closeMenu}");
    expect(source).toContain('event.key === "Escape"');
  });

  it("mantém o ambiente administrativo fora do SiteHeader", () => {
    const source = readFileSync("components/site-shell.tsx", "utf8");
    expect(source).toContain('pathname === "/admin" || pathname.startsWith("/admin/")');
    expect(source.indexOf("return <>{children}</>")).toBeLessThan(source.indexOf("<SiteHeader />"));
  });
});
