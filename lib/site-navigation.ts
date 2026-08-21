export type SiteNavigationItem = {
  label: string;
  href: string;
  external?: boolean;
};

const publicNavigation: readonly SiteNavigationItem[] = [
  { label: "Catálogo", href: "/" },
  { label: "LegisCast TV", href: "/legiscast" },
  { label: "Liga", href: "/ranking-legis" },
] as const;

const profileNavigation: SiteNavigationItem = { label: "Meu perfil", href: "/conta" };
const examNavigation: SiteNavigationItem = { label: "Meu Edital", href: "/meu-edital" };

export function legisQuestionsNavigation(authenticated: boolean | null): SiteNavigationItem {
  return authenticated === true
    ? { label: "Fazer questões", href: "/minhas-leis" }
    : { label: "Fazer questões", href: "/conta?modo=login&retorno=%2Fminhas-leis" };
}

export function headerNavigation(authenticated: boolean | null): readonly SiteNavigationItem[] {
  return authenticated === true
    ? [...publicNavigation, examNavigation, profileNavigation]
    : publicNavigation;
}
