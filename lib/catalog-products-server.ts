import "server-only";

import { getSupabaseServerClient } from "@/lib/supabase-server";
import { isOfflineBuild } from "@/lib/build-mode";
import { activeQuestionCountsBySlug } from "@/lib/question-counts-server";
import { aggregateCatalogModuleAvailability, catalogModules, type CatalogModuleAvailability, unavailableCatalogModules } from "@/lib/catalog-module-availability";

export type CatalogProduct = {
  id: string;
  nome: string;
  slug: string;
  leisIncluidas: number;
  totalFlashcards: number | null;
  modules: CatalogModuleAvailability;
};

type LoadedCatalogProduct = CatalogProduct & { destaque: boolean };
type CatalogProductLoad = { products: LoadedCatalogProduct[]; incomplete: boolean };

function withoutHighlight({ destaque: _destaque, ...product }: LoadedCatalogProduct): CatalogProduct {
  return product;
}

export function splitHomeCatalogProducts(loaded: ReadonlyArray<LoadedCatalogProduct>): { products: CatalogProduct[]; highlightedProducts: CatalogProduct[] } {
  return {
    products: loaded.map(withoutHighlight),
    highlightedProducts: loaded.filter((product) => product.destaque).map(withoutHighlight),
  };
}

async function loadCatalogProducts(destaque = false): Promise<CatalogProductLoad> {
  // A home é pré-renderizada. No build offline não há catálogo remoto disponível.
  if (isOfflineBuild()) return { products: [], incomplete: false };
  try {
    const supabase = getSupabaseServerClient();
    let productsQuery = supabase
      .from("produtos")
      .select("id,nome,slug,ordem,tipo_produto,destaque", { count: "exact" })
      .eq("ativo", true)
      .not("slug", "is", null)
      .order("ordem", { ascending: true })
      .order("nome", { ascending: true });
    if (destaque) productsQuery = productsQuery.eq("destaque", true);
    const { data: products, error: productsError, count: productCount } = await productsQuery;

    if (productsError) return { products: [], incomplete: true };
    if (!products?.length) return { products: [], incomplete: productCount === null };

    const productIds = products.map((product) => product.id);
    const { data: links, error: linksError } = await supabase
      .from("produto_leis")
      .select("produto_id,lei_id,recorte_id,leis(slug,status_publicacao)")
      .in("produto_id", productIds);

    if (linksError) return { products: [], incomplete: true };

    const lawSlugById = new Map<string, string>();
    for (const link of links ?? []) {
      const law = Array.isArray(link.leis) ? link.leis[0] : link.leis;
      if (law?.slug && law.status_publicacao === "ativa") lawSlugById.set(String(link.lei_id), law.slug);
    }
    const countsBySlug = await activeQuestionCountsBySlug([...lawSlugById.values()]);
    const activeLawIds = [...lawSlugById.keys()];
    const checksResult = activeLawIds.length
      ? await supabase.from("admin_law_overview_checks").select("lei_id,item").in("lei_id", activeLawIds)
      : { data: [] as Array<{ lei_id: string; item: string }>, error: null };
    if (checksResult.error) console.warn("[catalog] Não foi possível carregar os checks da Central da Lei.");
    const checksByLawId = new Map<string, Set<(typeof catalogModules)[number]>>();
    for (const row of checksResult.data ?? []) {
      const item = String(row.item);
      if (!catalogModules.includes(item as (typeof catalogModules)[number])) continue;
      const lawId = String(row.lei_id);
      const completed = checksByLawId.get(lawId) ?? new Set<(typeof catalogModules)[number]>();
      completed.add(item as (typeof catalogModules)[number]);
      checksByLawId.set(lawId, completed);
    }

    return { products: products.map((product) => {
      const productLinks = (links ?? [])
        .filter((link) => link.produto_id === product.id)
        .filter((link) => lawSlugById.has(String(link.lei_id)));
      const productLawIds = productLinks.map((link) => String(link.lei_id));
      const allProductLinks = (links ?? []).filter((link) => link.produto_id === product.id);
      if (!allProductLinks.length) console.warn(`[catalog] Produto ${product.id} não possui vínculo com lei; módulos exibidos como Em produção.`);

      return {
        id: product.id,
        nome: product.nome,
        slug: product.slug,
        destaque: product.destaque === true,
        leisIncluidas: productLawIds.length,
        totalFlashcards: productLawIds.length
          ? productLawIds.reduce(
              (total, lawId) => total + (countsBySlug.get(lawSlugById.get(lawId) ?? "") ?? 0),
              0,
            )
          : null,
        modules: checksResult.error
          ? unavailableCatalogModules()
          : aggregateCatalogModuleAvailability(productLinks.map((link) => ({
              recorteId: link.recorte_id == null ? null : String(link.recorte_id),
              completed: checksByLawId.get(String(link.lei_id)) ?? new Set(),
            })), product.tipo_produto === "lei_avulsa"),
      };
    }), incomplete: productCount === null || productCount > products.length };
  } catch {
    return { products: [], incomplete: true };
  }
}

export function getCatalogProducts(): Promise<CatalogProduct[]> {
  return loadCatalogProducts().then(({ products }) => products.map(withoutHighlight));
}

export function getHighlightedCatalogProducts(): Promise<CatalogProduct[]> {
  return loadCatalogProducts(true).then(({ products }) => products.map(withoutHighlight));
}

/** Carrega a lista e a vitrine da home a partir da mesma consulta, por requisição. */
export async function getHomeCatalogProducts(): Promise<{ products: CatalogProduct[]; highlightedProducts: CatalogProduct[] }> {
  const loaded = await loadCatalogProducts();
  if (!loaded.incomplete) return splitHomeCatalogProducts(loaded.products);
  const highlighted = await loadCatalogProducts(true);
  return { products: loaded.products.map(withoutHighlight), highlightedProducts: highlighted.products.map(withoutHighlight) };
}
