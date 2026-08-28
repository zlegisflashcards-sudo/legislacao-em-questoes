import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { headerNavigation, legisQuestionsNavigation } from "./site-navigation";

describe("cabeçalho único", () => {
  const publicLabels = ["Catálogo", "LegisCast TV", "Liga"];

  it("mantém os links públicos e oculta o perfil sem autenticação", () => {
    expect(headerNavigation(null).map((item) => item.label)).toEqual(publicLabels);
    expect(headerNavigation(false).map((item) => item.label)).toEqual(publicLabels);
    expect(headerNavigation(false).map((item) => item.href)).toEqual([
      "/",
      "/legiscast",
      "/liga/pmma",
    ]);
  });

  it("preserva os acessos secundários do aluno sem expor Dashboard", () => {
    expect(headerNavigation(true).map((item) => item.label)).toEqual([...publicLabels, "Meu Edital", "Meu perfil"]);
    expect(legisQuestionsNavigation(true)).toEqual({ label: "Fazer questões", href: "/minhas-leis" });
    expect(legisQuestionsNavigation(false)).toEqual({ label: "Fazer questões", href: "/conta?modo=login&retorno=%2Fminhas-leis" });
    expect(headerNavigation(true).at(-1)).toEqual({ label: "Meu perfil", href: "/conta" });
    expect(headerNavigation(true).some((item) => item.href === "/dashboard")).toBe(false);
  });

  it("deixa o CTA Fazer questões responsável pelo login do visitante", () => {
    expect(headerNavigation(false).some((item) => item.label === "Meu perfil")).toBe(false);
    expect(headerNavigation(false).some((item) => item.label === "Meu Edital")).toBe(false);
  });

  it("renderiza desktop e mobile a partir das mesmas fontes", () => {
    const source = readFileSync("components/site-header.tsx", "utf8");
    expect(source.match(/navigation\.map/g)).toHaveLength(2);
    expect(source).toContain('aria-label="Navegação principal no celular"');
    expect(source).toContain("onSelect={closeMenu}");
    expect(source).toContain('event.key === "Escape"');
    expect(source).toContain("const legisQuestions = legisQuestionsNavigation(authenticated)");
    expect(source).toContain('href={legisQuestions.href}');
    expect(source).toContain(">Fazer questões</Link>");
    expect(source).toContain('<WhatsAppIcon /><span className="hidden xl:inline">WhatsApp</span>');
  });

  it("mantém o ambiente administrativo fora do SiteHeader", () => {
    const source = readFileSync("components/site-shell.tsx", "utf8");
    expect(source).toContain('pathname === "/admin" || pathname.startsWith("/admin/")');
    expect(source.indexOf("return <>{children}</>")).toBeLessThan(source.indexOf("<SiteHeader />"));
  });
});
