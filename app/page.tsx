import { HomeCategoriasVadeMecum } from "@/components/home-categorias-vade-mecum";
import { LegislacaoSearch } from "@/components/legislacao-search";
import { filtrarLegislacoesAtivas, getLegislacoes } from "@/lib/legislacoes";

export default async function Home() {
  const legislacoes = await getLegislacoes();
  const legislacoesAtivas = filtrarLegislacoesAtivas(legislacoes);

  return (
    <div className="bg-[#171a21]">
      <div className="mx-auto flex max-w-6xl flex-col gap-12 px-5 py-6 sm:px-6 sm:py-10">
        <section className="relative">
          <div className="overflow-hidden rounded-lg border border-slate-700 bg-slate-950 shadow-[0_24px_70px_rgba(0,0,0,0.42)]">
            <picture>
              <source
                media="(max-width: 640px)"
                srcSet="/home-hero-mobile.png"
              />
              <img
                src="/home-hero-desktop.png"
                alt="Legis Flashcards"
                className="h-auto min-h-[260px] w-full object-cover sm:min-h-[320px]"
              />
            </picture>
          </div>

          <div className="relative z-10 -mt-10 w-full sm:-mt-12">
            <div className="rounded-lg border border-slate-700 bg-white p-4 shadow-[0_18px_48px_rgba(0,0,0,0.28)] sm:p-5">
              <LegislacaoSearch legislacoes={legislacoesAtivas} />
            </div>
          </div>
        </section>

        <HomeCategoriasVadeMecum legislacoes={legislacoesAtivas} />

        <footer className="border-t border-slate-700 pt-6 text-center text-sm text-slate-400">
          Versão Online 1.0
        </footer>
      </div>
    </div>
  );
}
