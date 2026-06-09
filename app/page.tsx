import { HomeCategoriasVadeMecum } from "@/components/home-categorias-vade-mecum";
import { LegislacaoSearch } from "@/components/legislacao-search";
import { filtrarLegislacoesAtivas, getLegislacoes } from "@/lib/legislacoes";

export default async function Home() {
  const legislacoes = await getLegislacoes();
  const legislacoesAtivas = filtrarLegislacoesAtivas(legislacoes);

  return (
    <div className="bg-[#171a21]">
      <div className="mx-auto flex max-w-6xl flex-col gap-12 px-5 py-10 sm:px-6 sm:py-16">
        <section className="mx-auto flex w-full max-w-xl flex-col gap-5 text-center">
          <div className="space-y-3">
            <p className="text-sm font-semibold leading-6 text-slate-200">
              Encontre a legislação que você quer estudar.
            </p>
            <p className="text-sm leading-6 text-slate-300">
              Consulte materiais disponíveis com questões em flashcards,
              legislação esquematizada e Legiscast.
            </p>
          </div>

          <div className="w-full">
            <LegislacaoSearch legislacoes={legislacoesAtivas} />
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
