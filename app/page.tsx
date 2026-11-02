import { HomeCategoriasVadeMecum } from "@/components/home-categorias-vade-mecum";
import { getHomeCatalogProducts } from "@/lib/catalog-products-server";
import { filtrarLegislacoesAtivas, getLegislacoes } from "@/lib/legislacoes";
import { withActiveQuestionCounts } from "@/lib/legislation-question-counts-server";

// A quantidade de flashcards vem de public.questions e precisa refletir o banco principal em runtime.
export const dynamic = "force-dynamic";

export default async function Home() {
  const [catalogProducts, catalogo] = await Promise.all([
    getHomeCatalogProducts(),
    getLegislacoes(),
  ]);
  const legislacoes = await withActiveQuestionCounts(catalogo);

  return (
    <div className="bg-[#070b12]">
      <div className="mx-auto flex max-w-6xl flex-col gap-8 px-5 py-6 sm:px-6 sm:py-9">
        <HomeCategoriasVadeMecum legislacoes={filtrarLegislacoesAtivas(legislacoes)} produtos={catalogProducts.products} produtosEmDestaque={catalogProducts.highlightedProducts} />
      </div>
    </div>
  );
}
