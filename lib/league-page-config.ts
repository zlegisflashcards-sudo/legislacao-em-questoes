export type LeaguePageConfig = {
  slug: string;
  heroTitle: string;
  heroSubtitle: string;
  heroImage: string | null;
  ctaLabel: string;
  ctaHref: string | null;
};

const leaguePageConfigs: Record<string, LeaguePageConfig> = {
  pmma: {
    slug: "pmma",
    heroTitle: "RANKING LEGIS QUESTÕES",
    heroSubtitle: "Some seus melhores scores nas leis do edital e suba no ranking.",
    heroImage: "/league/pmma-hero.png",
    ctaLabel: "🎮 Quero entrar na Liga PMMA",
    ctaHref: null,
  },
};

export function leaguePageConfig(slug: string): LeaguePageConfig {
  return leaguePageConfigs[slug] ?? {
    slug,
    heroTitle: "RANKING GERAL DE LEGISLAÇÃO",
    heroSubtitle: "Some seus melhores scores nas leis do edital e suba no ranking.",
    heroImage: null,
    ctaLabel: "🎮 Quero entrar na Liga",
    ctaHref: null,
  };
}

export type LeaguePresentationSource = {
  slug: string;
  name: string;
  title: string;
  subtitle: string | null;
  bannerUrl: string | null;
  ctaLabel: string | null;
  ctaHref: string | null;
  productSlug: string | null;
};

export function leaguePagePresentation(league: LeaguePresentationSource): LeaguePageConfig {
  const fallback = leaguePageConfig(league.slug);
  const hasAdministrativePresentation = Boolean(league.subtitle || league.bannerUrl || league.ctaLabel || league.ctaHref);
  return {
    slug: league.slug,
    heroTitle: hasAdministrativePresentation ? league.title || fallback.heroTitle : fallback.heroTitle,
    heroSubtitle: league.subtitle || fallback.heroSubtitle,
    heroImage: league.bannerUrl || fallback.heroImage,
    ctaLabel: league.ctaLabel || fallback.ctaLabel,
    ctaHref: league.ctaHref || (league.productSlug ? `/leisflashcards/${league.productSlug}` : fallback.ctaHref),
  };
}

export function leagueProductHref(config: LeaguePageConfig) {
  return config.ctaHref || "/catalogo";
}
