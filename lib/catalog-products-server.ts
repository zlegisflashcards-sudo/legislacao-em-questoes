import "server-only";

import { getSupabaseServerClient } from "@/lib/supabase-server";
import { isOfflineBuild } from "@/lib/build-mode";
import { activeQuestionCountsBySlug } from "@/lib/question-counts-server";
import { mainStructure } from "@/lib/questions-main-server";
import { descendantsForScope } from "@/lib/law-question-scope-resolution";
import { aggregateCatalogModuleAvailability, catalogModules, type CatalogModuleAvailability, unavailableCatalogModules } from "@/lib/catalog-module-availability";

export type CatalogProduct = {
  id: string;
  nome: string;
  slug: string;
  tipoProduto: string;
  imagemUrl: string | null;
  freeStudyHref: string | null;
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

type CatalogScopeTarget = { lawId: number; scopeId: string };
type CatalogClient = ReturnType<typeof getSupabaseServerClient>;

function catalogScopeKey(lawId: string | number, scopeId: string) {
  return `${lawId}:${scopeId}`;
}

async function countCatalogScopes(supabase: CatalogClient, targets: CatalogScopeTarget[]) {
  const counts = new Map<string, number>();
  if (!targets.length) return counts;

  const scopeIds = [...new Set(targets.map(({ scopeId }) => scopeId))];
  const links = await supabase
    .from("recortes_leis_estrutura")
    .select("recorte_id,structure_id,lei_id")
    .in("recorte_id", scopeIds);
  if (links.error) return counts;

  const selectedByScope = new Map<string, number[]>();
  for (const link of links.data ?? []) {
    const key = catalogScopeKey(link.lei_id, link.recorte_id);
    const selected = selectedByScope.get(key) ?? [];
    selected.push(Number(link.structure_id));
    selectedByScope.set(key, selected);
  }

  const structureByLaw = new Map<number, ReturnType<typeof mainStructure>>();
  const uniqueTargets = new Map(targets.map((target) => [catalogScopeKey(target.lawId, target.scopeId), target]));
  await Promise.all([...uniqueTargets].map(async ([key, { lawId }]) => {
    const selected = selectedByScope.get(key);
    if (!selected?.length) return;
    try {
      const pendingStructure = structureByLaw.get(lawId) ?? mainStructure(lawId);
      structureByLaw.set(lawId, pendingStructure);
      const structure = await pendingStructure;
      const activeIds = new Set(structure.map((node) => node.id));
      const roots = selected.filter((id) => activeIds.has(id));
      if (!roots.length) return;
      const ids = descendantsForScope(structure, roots);
      let count = 0;
      // Disjoint chunks limit the filter URL without counting descendants twice.
      for (let start = 0; start < ids.length; start += 100) {
        const result = await supabase.from("questions").select("id", { count: "exact", head: true })
          .eq("lei_id", lawId).eq("ativo", true).in("structure_id", ids.slice(start, start + 100));
        if (result.error || result.count === null) return;
        count += result.count;
      }
      counts.set(key, count);
    } catch {
      // A missing scope count should not remove the whole catalog or inherit the full law count.
    }
  }));
  return counts;
}

async function loadCatalogProducts(destaque = false): Promise<CatalogProductLoad> {
  // A home é pré-renderizada. No build offline não há catálogo remoto disponível.
  if (isOfflineBuild()) return { products: [], incomplete: false };
  try {
    const supabase = getSupabaseServerClient();
    let productsQuery = supabase
      .from("produtos")
      .select("id,nome,slug,ordem,tipo_produto,destaque,imagem_url", { count: "exact" })
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
      .select("produto_id,lei_id,recorte_id,leis(slug,status_publicacao,acesso_gratuito)")
      .in("produto_id", productIds);

    if (linksError) return { products: [], incomplete: true };

    const lawSlugById = new Map<string, string>();
    const freeLawIds = new Set<string>();
    for (const link of links ?? []) {
      const law = Array.isArray(link.leis) ? link.leis[0] : link.leis;
      if (law?.slug && law.status_publicacao === "ativa") {
        const lawId = String(link.lei_id);
        lawSlugById.set(lawId, law.slug);
        if (law.acesso_gratuito === true) freeLawIds.add(lawId);
      }
    }
    const activeLawIds = [...lawSlugById.keys()];
    const scopeTargets: CatalogScopeTarget[] = (links ?? []).flatMap((link) =>
      typeof link.recorte_id === "string" && lawSlugById.has(String(link.lei_id))
        ? [{ lawId: Number(link.lei_id), scopeId: link.recorte_id }]
        : [],
    );
    const [countsBySlug, scopeCounts, checksResult] = await Promise.all([
      activeQuestionCountsBySlug([...lawSlugById.values()]),
      countCatalogScopes(supabase, scopeTargets),
      activeLawIds.length
        ? supabase.from("admin_law_overview_checks").select("lei_id,item").in("lei_id", activeLawIds)
        : { data: [] as Array<{ lei_id: string; item: string }>, error: null },
    ]);
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
      const soleLaw = productLinks.length === 1 ? productLinks[0] : null;
      const soleLawId = soleLaw ? String(soleLaw.lei_id) : null;
      // A gratuidade é cadastrada na lei. Um CTA comercial só pode abrir um
      // estudo específico quando o produto avulso possui uma única lei ativa.
      const freeStudyHref = product.tipo_produto === "lei_avulsa" && soleLawId && freeLawIds.has(soleLawId)
        ? `/estudar/lei/${encodeURIComponent(lawSlugById.get(soleLawId) ?? "")}${typeof soleLaw?.recorte_id === "string" ? `?recorte_id=${encodeURIComponent(soleLaw.recorte_id)}` : ""}`
        : null;
      const linkCounts = productLinks.map((link) => typeof link.recorte_id === "string"
        ? scopeCounts.get(catalogScopeKey(link.lei_id, link.recorte_id)) ?? null
        : countsBySlug.get(lawSlugById.get(String(link.lei_id)) ?? "") ?? 0);
      const totalFlashcards = linkCounts.length && linkCounts.every((count): count is number => count !== null)
        ? linkCounts.reduce((total, count) => total + count, 0)
        : null;
      const freeQuestionScope = freeStudyHref !== null && typeof soleLaw?.recorte_id === "string";
      if (!allProductLinks.length) console.warn(`[catalog] Produto ${product.id} não possui vínculo com lei; módulos exibidos como Em produção.`);

      return {
        id: product.id,
        nome: product.nome,
        slug: product.slug,
        tipoProduto: product.tipo_produto,
        imagemUrl: typeof product.imagem_url === "string" && product.imagem_url.trim() ? product.imagem_url : null,
        freeStudyHref,
        destaque: product.destaque === true,
        leisIncluidas: productLawIds.length,
        totalFlashcards,
        modules: freeQuestionScope
          ? { ...unavailableCatalogModules(), questoes: (totalFlashcards ?? 0) > 0 }
          : checksResult.error
            ? unavailableCatalogModules()
            : aggregateCatalogModuleAvailability(productLinks.map((link) => ({
              completed: checksByLawId.get(String(link.lei_id)) ?? new Set(),
            }))),
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
