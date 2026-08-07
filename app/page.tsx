import { HomeCategoriasVadeMecum } from "@/components/home-categorias-vade-mecum";
import { getCatalogProducts } from "@/lib/catalog-products-server";

export default async function Home() {
  const produtos = await getCatalogProducts();

  return (
    <div className="bg-[#070b12]">
      <div className="mx-auto flex max-w-6xl flex-col gap-8 px-5 py-6 sm:px-6 sm:py-9">
        <HomeCategoriasVadeMecum produtos={produtos} />
      </div>
    </div>
  );
}
