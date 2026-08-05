import { siteConfig } from "./site-config";

export type SiteNavigationItem = {
  label: string;
  href: string;
  external?: boolean;
};

export const primaryNavigation: readonly SiteNavigationItem[] = [
  { label: "Catálogo", href: "/" },
  { label: "LegisCast TV", href: "/legiscast" },
  { label: "Liga das Leis", href: "/ranking-legis" },
  { label: "Minhas leis adquiridas", href: siteConfig.links.minhasLeis, external: true },
  { label: "Meu perfil", href: "/conta" },
] as const;

export function headerActions(authenticated: boolean): SiteNavigationItem[] {
  return authenticated ? [] : [{ label: "Entrar", href: "/conta?modo=login" }];
}
