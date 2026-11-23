import { isValidLawSlug } from "@/lib/law-study";

export type FreeProductLaw = {
  lawId: number; slug: string; recorteId: unknown; lawFree: boolean; published: boolean;
};
export type FreeProductScope = { id: unknown; lei_id: unknown; ativo: unknown; status_publicacao: unknown; acesso_gratuito: unknown };

export function validProductScopeId(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(value);
}

export function freeProductDetailHref(tipoProduto: string, links: FreeProductLaw[], scope: FreeProductScope | null) {
  const published = links.filter((link) => link.published && isValidLawSlug(link.slug));
  if (tipoProduto !== "lei_avulsa" || published.length !== 1) return null;
  const { slug, recorteId, lawFree, lawId } = published[0];
  const base = `/estudar/lei/${encodeURIComponent(slug)}`;
  if (recorteId === null) return lawFree ? base : null;
  return validProductScopeId(recorteId) && scope?.id === recorteId && Number(scope.lei_id) === lawId &&
    scope.ativo === true && scope.status_publicacao === "ativa" && scope.acesso_gratuito === true
    ? `${base}?recorte_id=${encodeURIComponent(recorteId)}` : null;
}
