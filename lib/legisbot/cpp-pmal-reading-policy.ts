export const CPP_PMAL_SCOPE_ID = "41226d19-63ff-4353-b081-df23b91b9a21";
export const CPP_LAW_ID = 61;
export const CPP_PMAL_TITLES = [
  { id: 608, label: "Título 02 - Do Inquérito Policial", articles: "Arts. 4º a 23" },
  { id: 609, label: "Título 03 - Da Ação Penal", articles: "Arts. 24 a 62" },
] as const;

export function isCppPmalReading(slug: string, scope: unknown) {
  return slug.toLowerCase() === "cpp" && scope === CPP_PMAL_SCOPE_ID;
}

export function cppPmalReadingHasEntitlement(
  releases: Array<{ produto_id: string | null }>,
  links: Array<{ produto_id: string; recorte_id: string | null }>,
  activeProductIds: string[],
) {
  if (releases.some(({ produto_id }) => produto_id === null)) return true;
  const active = new Set(activeProductIds);
  const owned = new Set(releases.map(({ produto_id }) => produto_id));
  return links.some((link) => active.has(link.produto_id) && owned.has(link.produto_id) && (link.recorte_id === null || link.recorte_id === CPP_PMAL_SCOPE_ID));
}

export function cppPmalReadingHasExactTitles(structureIds: number[]) {
  return structureIds.length === CPP_PMAL_TITLES.length && CPP_PMAL_TITLES.every(({ id }) => structureIds.includes(id));
}

export type CppPmalReadingBlock = { id: string; structureId: number; label: string; html: string };
