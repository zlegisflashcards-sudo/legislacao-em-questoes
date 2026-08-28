export type ScopeAccessRelease = { produto_id: string | null };
export type ScopeAccessProductLaw = { produto_id: string; recorte_id: string | null };

export function availableLawStudyAccess(releases: ScopeAccessRelease[], productLinks: ScopeAccessProductLaw[]) {
  const full = releases.some((release) => release.produto_id === null) || productLinks.some((link) => link.recorte_id === null);
  return { full, recorteIds: [...new Set(productLinks.flatMap((link) => typeof link.recorte_id === "string" ? [link.recorte_id] : []))] };
}
