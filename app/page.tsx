import { HomeCategoriasVadeMecum } from "@/components/home-categorias-vade-mecum";
import { filtrarLegislacoesAtivas, getLegislacoes } from "@/lib/legislacoes";

export default async function Home() {
  const legislacoes = await getLegislacoes();
  const legislacoesAtivas = filtrarLegislacoesAtivas(legislacoes);

  return (
    <div className="bg-[#070b12]">
      <div className="mx-auto flex max-w-6xl flex-col gap-8 px-5 py-6 sm:px-6 sm:py-9">
        <HomeCategoriasVadeMecum legislacoes={legislacoesAtivas} />
      </div>
    </div>
  );
}
