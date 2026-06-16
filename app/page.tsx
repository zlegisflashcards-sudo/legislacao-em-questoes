import { HomeCategoriasVadeMecum } from "@/components/home-categorias-vade-mecum";
import { LegislacaoSearch } from "@/components/legislacao-search";
import { filtrarLegislacoesAtivas, getLegislacoes } from "@/lib/legislacoes";

export default async function Home() {
  const legislacoes = await getLegislacoes();
  const legislacoesAtivas = filtrarLegislacoesAtivas(legislacoes);

  return (
    <div className="bg-[#070b12]">
      <div className="mx-auto flex max-w-6xl flex-col gap-12 px-5 py-6 sm:px-6 sm:py-10">
        <section
          className="relative aspect-video min-h-[320px] overflow-hidden rounded-lg border border-blue-500/20 bg-contain bg-center bg-no-repeat shadow-[0_24px_70px_rgba(0,0,0,0.48)] sm:min-h-0"
          style={{
            backgroundImage:
              "linear-gradient(rgba(0,0,0,0.72), rgba(0,0,0,0.72)), url('/home-hero-desktop.png')",
          }}
        >
          <div className="relative flex h-full items-center justify-center px-5 py-8 sm:px-8 lg:px-14">
            <div className="w-full max-w-5xl space-y-5 text-center">
              <p className="text-sm font-black uppercase tracking-[0.24em] text-blue-300">
                LEGIS FLASHCARDS
              </p>

              <h1 className="text-3xl font-black leading-tight text-white drop-shadow-[0_6px_24px_rgba(0,0,0,0.65)] sm:text-5xl lg:text-6xl">
                Encontre a legislação
                <br />
                que você quer estudar
              </h1>

              <div className="mx-auto w-full max-w-5xl">
                <LegislacaoSearch
                  legislacoes={legislacoesAtivas}
                  variant="dark"
                />
                <p className="mt-4 text-center text-xs font-semibold text-slate-300">
                  ∞ Acesso Vitalício • ⬇️ Acesso Ilimitado • 🔄 Sempre
                  Atualizado*
                </p>
              </div>
            </div>
          </div>
        </section>

        <HomeCategoriasVadeMecum legislacoes={legislacoesAtivas} />
      </div>
    </div>
  );
}
