import { HomeCategoriasVadeMecum } from "@/components/home-categorias-vade-mecum";
import { getCatalogProducts, getHighlightedCatalogProducts } from "@/lib/catalog-products-server";
import { filtrarLegislacoesAtivas, getLegislacoes } from "@/lib/legislacoes";
import { withActiveQuestionCounts } from "@/lib/legislation-question-counts-server";

export const revalidate = 60;

export default async function Home() {
  const [produtos, produtosEmDestaque, catalogo] = await Promise.all([
    getCatalogProducts(),
    getHighlightedCatalogProducts(),
    getLegislacoes(),
  ]);
  const legislacoes = await withActiveQuestionCounts(catalogo);

  return (
    <div className="bg-[#070b12]">
      <div className="mx-auto flex max-w-6xl flex-col gap-8 px-5 py-6 sm:px-6 sm:py-9">
        <HomeCategoriasVadeMecum legislacoes={filtrarLegislacoesAtivas(legislacoes)} produtos={produtos} produtosEmDestaque={produtosEmDestaque} />
      </div>
    </div>
  );
}
