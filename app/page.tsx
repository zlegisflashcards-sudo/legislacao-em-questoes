import { HomeCategoriasVadeMecum } from "@/components/home-categorias-vade-mecum";
import { LegislacaoSearch } from "@/components/legislacao-search";
import { filtrarLegislacoesAtivas, getLegislacoes } from "@/lib/legislacoes";
import { siteConfig } from "@/lib/site-config";

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
                <div className="mt-4 flex flex-col gap-3 rounded-lg border border-blue-300/25 bg-slate-950/55 px-4 py-4 text-left shadow-[0_12px_28px_rgba(0,0,0,0.22)] backdrop-blur sm:flex-row sm:items-center sm:justify-between sm:px-5">
                  <div className="space-y-1">
                    <p className="text-sm font-black text-white">
                      Não encontrou sua legislação?
                    </p>
                    <p className="text-xs leading-5 text-slate-300 sm:text-sm">
                      Podemos transformar ela em flashcards, legislação
                      esquematizada e Legiscast.
                    </p>
                  </div>
                  <a
                    href={siteConfig.links.encomendarLegislacao}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex w-full items-center justify-center rounded-lg bg-blue-600 px-5 py-3 text-center text-sm font-black text-white shadow-[0_12px_26px_rgba(37,99,235,0.34)] transition hover:-translate-y-0.5 hover:bg-blue-500 sm:w-auto sm:shrink-0"
                  >
                    Solicitar orçamento de legislação
                  </a>
                </div>
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
