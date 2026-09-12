export type LegiscastAdminLawOption = { id: number; slug: string; titulo: string };

export function filterLegiscastAdminLaws(laws: LegiscastAdminLawOption[], query: string) {
  const normalized = query.trim().toLocaleLowerCase("pt-BR");
  return normalized ? laws.filter((law) => `${law.titulo} ${law.slug}`.toLocaleLowerCase("pt-BR").includes(normalized)) : laws;
}

export function normalizeLegiscastPdfPage(value: string) {
  const normalized = value.trim();
  if (!normalized) return null;
  if (!/^\d+$/.test(normalized) || !Number.isSafeInteger(Number(normalized)) || Number(normalized) < 1) throw new Error("A página do PDF deve ser um número inteiro maior ou igual a 1.");
  return Number(normalized);
}
