import "server-only";

import { getSupabaseServerClient } from "@/lib/supabase-server";
import { isOfflineBuild } from "@/lib/build-mode";
import { activeQuestionCountsBySlug } from "@/lib/question-counts-server";

export type CatalogProduct = {
  id: string;
  nome: string;
  slug: string;
  leisIncluidas: number;
  totalFlashcards: number | null;
};

async function loadCatalogProducts(destaque = false): Promise<CatalogProduct[]> {
  // A home é pré-renderizada. No build offline não há catálogo remoto disponível.
  if (isOfflineBuild()) return [];
  try {
    const supabase = getSupabaseServerClient();
    let productsQuery = supabase
      .from("produtos")
      .select("id,nome,slug,ordem")
      .eq("ativo", true)
      .not("slug", "is", null)
      .order("ordem", { ascending: true })
      .order("nome", { ascending: true });
    if (destaque) productsQuery = productsQuery.eq("destaque", true);
    const { data: products, error: productsError } = await productsQuery;

    if (productsError || !products?.length) return [];

    const productIds = products.map((product) => product.id);
    const { data: links, error: linksError } = await supabase
      .from("produto_leis")
      .select("produto_id,lei_id,leis(slug)")
      .in("produto_id", productIds);

    if (linksError) return [];

    const lawSlugById = new Map<string, string>();
    for (const link of links ?? []) {
      const law = Array.isArray(link.leis) ? link.leis[0] : link.leis;
      if (law?.slug) lawSlugById.set(link.lei_id, law.slug);
    }
    const countsBySlug = await activeQuestionCountsBySlug([...lawSlugById.values()]);

    return products.map((product) => {
      const productLawIds = (links ?? [])
        .filter((link) => link.produto_id === product.id)
        .map((link) => link.lei_id);

      return {
        id: product.id,
        nome: product.nome,
        slug: product.slug,
        leisIncluidas: productLawIds.length,
        totalFlashcards: productLawIds.length
          ? productLawIds.reduce(
              (total, lawId) => total + (countsBySlug.get(lawSlugById.get(lawId) ?? "") ?? 0),
              0,
            )
          : null,
      };
    });
  } catch {
    return [];
  }
}

export function getCatalogProducts(): Promise<CatalogProduct[]> {
  return loadCatalogProducts();
}

export function getHighlightedCatalogProducts(): Promise<CatalogProduct[]> {
  return loadCatalogProducts(true);
}
