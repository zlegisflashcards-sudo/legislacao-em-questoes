type SearchableLegislation = {
  nome: string;
  categoria: string;
  slug: string;
};

export function normalizeLegislationSearch(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

export function matchesLegislationSearch(legislacao: SearchableLegislation, query: string) {
  const normalizedQuery = normalizeLegislationSearch(query);
  if (!normalizedQuery) return false;

  return [legislacao.nome, legislacao.categoria, legislacao.slug]
    .some((value) => normalizeLegislationSearch(value).includes(normalizedQuery));
}
