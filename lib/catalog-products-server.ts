import "server-only";

import { getSupabaseServerClient } from "@/lib/supabase-server";

export type CatalogProduct = {
  id: string;
  nome: string;
  slug: string;
  leisIncluidas: number;
  totalFlashcards: number | null;
};

export async function getCatalogProducts(): Promise<CatalogProduct[]> {
  try {
    const supabase = getSupabaseServerClient();
    const highlightedProducts = await supabase
      .from("produtos")
      .select("id,nome,slug,ordem")
      .eq("ativo", true)
      .eq("destaque", true)
      .not("slug", "is", null)
      .order("ordem", { ascending: true })
      .order("nome", { ascending: true });
    const { data: products, error: productsError } = highlightedProducts.error
      ? await supabase
          .from("produtos")
          .select("id,nome,slug,ordem")
          .eq("ativo", true)
          .not("slug", "is", null)
          .order("ordem", { ascending: true })
          .order("nome", { ascending: true })
      : highlightedProducts;

    if (productsError || !products?.length) return [];

    const productIds = products.map((product) => product.id);
    const { data: links, error: linksError } = await supabase
      .from("produto_leis")
      .select("produto_id,lei_id")
      .in("produto_id", productIds);

    if (linksError) return [];

    const lawIds = Array.from(new Set((links ?? []).map((link) => link.lei_id)));
    const { data: materials, error: materialsError } = lawIds.length
      ? await supabase
          .from("materiais_leis")
          .select("lei_id,quantidade_itens")
          .in("lei_id", lawIds)
          .eq("tipo", "flashcards")
          .eq("ativo", true)
      : { data: [], error: null };

    if (materialsError) return [];

    const totalsByLaw = new Map<string, number>();
    const lawsWithFlashcardCount = new Set<string>();
    for (const material of materials ?? []) {
      if (typeof material.quantidade_itens !== "number") continue;
      lawsWithFlashcardCount.add(material.lei_id);
      totalsByLaw.set(
        material.lei_id,
        (totalsByLaw.get(material.lei_id) ?? 0) + material.quantidade_itens,
      );
    }

    return products.map((product) => {
      const productLawIds = (links ?? [])
        .filter((link) => link.produto_id === product.id)
        .map((link) => link.lei_id);
      const hasCompleteFlashcardCount =
        productLawIds.length > 0 &&
        productLawIds.every((lawId) => lawsWithFlashcardCount.has(lawId));

      return {
        id: product.id,
        nome: product.nome,
        slug: product.slug,
        leisIncluidas: productLawIds.length,
        totalFlashcards: hasCompleteFlashcardCount
          ? productLawIds.reduce((total, lawId) => total + (totalsByLaw.get(lawId) ?? 0), 0)
          : null,
      };
    });
  } catch {
    return [];
  }
}
