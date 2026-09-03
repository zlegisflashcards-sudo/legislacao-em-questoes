import { describe, expect, it } from "vitest";
import { leaguePageConfig, leaguePagePresentation, leagueProductHref } from "@/lib/league-page-config";

describe("configuração visual e comercial das Ligas", () => {
  it("mantém PMMA configurada fora do componente genérico", () => {
    const config = leaguePageConfig("pmma");

    expect(config.heroImage).toBe("/league/pmma-hero.png");
    expect(leagueProductHref(leaguePagePresentation({ ...config, name: "Liga PMMA", title: "Ranking da Liga PMMA", subtitle: null, bannerUrl: null, ctaLabel: null, ctaHref: null, productSlug: "pmmasd" }))).toBe("/leisflashcards/pmmasd");
  });

  it("oferece um fallback seguro para futuras Ligas", () => {
    expect(leagueProductHref(leaguePageConfig("pmerj"))).toBe("/catalogo");
  });

  it("prioriza os dados administrativos quando a Liga estiver configurada", () => {
    const presentation = leaguePagePresentation({
      slug: "pmma", name: "Liga PMMA", title: "Ranking da Liga PMMA", subtitle: "Estude e suba no placar.",
      bannerUrl: "https://cdn.example.com/pmma.webp", ctaLabel: "Entrar agora", ctaHref: "/oferta-pmma", productSlug: "pmmasd",
    });
    expect(presentation).toMatchObject({ heroTitle: "Ranking da Liga PMMA", heroSubtitle: "Estude e suba no placar.", heroImage: "https://cdn.example.com/pmma.webp", ctaLabel: "Entrar agora", ctaHref: "/oferta-pmma" });
  });

  it("usa o fallback visual até a configuração administrativa ser aplicada", () => {
    const presentation = leaguePagePresentation({
      slug: "pmma", name: "Liga PMMA", title: "Ranking Geral de Legislação", subtitle: null,
      bannerUrl: null, ctaLabel: null, ctaHref: null, productSlug: null,
    });
    expect(presentation.heroTitle).toBe("RANKING LEGIS QUESTÕES");
  });
});
