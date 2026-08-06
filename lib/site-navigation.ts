export type SiteNavigationItem = {
  label: string;
  href: string;
  external?: boolean;
};

const publicNavigation: readonly SiteNavigationItem[] = [
  { label: "Catálogo", href: "/" },
  { label: "LegisCast TV", href: "/legiscast" },
  { label: "Liga das Leis", href: "/ranking-legis" },
] as const;

const profileNavigation: SiteNavigationItem = { label: "Meu perfil", href: "/conta" };

export function headerNavigation(authenticated: boolean | null): readonly SiteNavigationItem[] {
  const studentLawsNavigation: SiteNavigationItem = authenticated === true
    ? { label: "Minhas leis adquiridas", href: "/minhas-leis" }
    : { label: "Minhas leis adquiridas", href: "/conta?modo=login&retorno=%2Fminhas-leis" };
  return authenticated === true
    ? [...publicNavigation, studentLawsNavigation, profileNavigation]
    : [...publicNavigation, studentLawsNavigation];
}

export function headerActions(authenticated: boolean | null): readonly SiteNavigationItem[] {
  if (authenticated === null) return [];
  return authenticated
    ? [{ label: "Meu painel", href: "/dashboard" }]
    : [{ label: "Entrar", href: "/conta?modo=login&retorno=%2Fdashboard" }];
}
