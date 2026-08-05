import { siteConfig } from "./site-config";

export type SiteNavigationItem = {
  label: string;
  href: string;
  external?: boolean;
};

const publicNavigation: readonly SiteNavigationItem[] = [
  { label: "Catálogo", href: "/" },
  { label: "LegisCast TV", href: "/legiscast" },
  { label: "Liga das Leis", href: "/ranking-legis" },
  { label: "Minhas leis adquiridas", href: siteConfig.links.minhasLeis, external: true },
] as const;

const profileNavigation: SiteNavigationItem = { label: "Meu perfil", href: "/conta" };

export function headerNavigation(authenticated: boolean | null): readonly SiteNavigationItem[] {
  return authenticated === true ? [...publicNavigation, profileNavigation] : publicNavigation;
}

export function headerActions(authenticated: boolean | null): readonly SiteNavigationItem[] {
  if (authenticated === null) return [];
  return authenticated
    ? [{ label: "Meu painel", href: "/dashboard" }]
    : [{ label: "Entrar", href: "/conta?modo=login&retorno=%2Fdashboard" }];
}
