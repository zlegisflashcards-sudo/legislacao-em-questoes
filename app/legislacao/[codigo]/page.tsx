import { notFound } from "next/navigation";
import { LegislacaoContentTabs } from "@/components/legislacao-content-tabs";
import {
  encontrarLegislacaoPorSlug,
  filtrarLegislacoesAtivas,
  getLegislacoes,
  getYoutubeEmbedUrl,
} from "@/lib/legislacoes";

type LegislacaoPageProps = {
  params: Promise<{
    codigo: string;
  }>;
};

export async function generateStaticParams() {
  const legislacoes = await getLegislacoes();

  return filtrarLegislacoesAtivas(legislacoes).map((legislacao) => ({
    codigo: legislacao.slug,
  }));
}

export default async function LegislacaoPage({ params }: LegislacaoPageProps) {
  const { codigo } = await params;
  const legislacoes = await getLegislacoes();
  const legislacao = encontrarLegislacaoPorSlug(legislacoes, codigo);

  if (!legislacao) {
    notFound();
  }

  const youtubeEmbedUrl = getYoutubeEmbedUrl(legislacao.youtubeUrl);
  const legiscastEmbedUrl = legislacao.legiscastUrl
    ? getYoutubeEmbedUrl(legislacao.legiscastUrl)
    : undefined;

  return (
    <div className="bg-[#171a21]">
      <div className="mx-auto flex max-w-6xl flex-col gap-8 px-5 py-10 sm:px-6 sm:py-14">
        <div className="space-y-4">
          <a
            href="/"
            className="text-sm font-semibold text-slate-300 hover:text-blue-300"
          >
            ← Voltar para a Home
          </a>

          <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr] lg:items-end">
            <div className="space-y-3">
              <p className="text-sm font-semibold uppercase tracking-wide text-blue-300">
                {legislacao.categoria}
              </p>
              <h1 className="text-4xl font-bold leading-tight text-white sm:text-5xl">
                {legislacao.nome}
              </h1>
              <p className="max-w-2xl text-lg leading-8 text-slate-200">
                {legislacao.descricaoCurta}
              </p>
            </div>

            <div className="rounded-lg border border-blue-200/30 bg-white p-6 shadow-[0_22px_55px_rgba(0,0,0,0.32)]">
              <p className="text-sm font-semibold uppercase tracking-wide text-slate-500">
                Quantidade de Flashcards
              </p>
              <p className="mt-3 flex items-center gap-2 text-4xl font-black text-[#062a5f] sm:text-5xl">
                <span className="text-sky-400">⚡</span>
                {legislacao.quantidadeFlashcards}
                <span className="text-2xl font-bold text-slate-900">
                  Flashcards
                </span>
              </p>
            </div>
          </div>
        </div>

        <LegislacaoContentTabs
          questoesUrl={youtubeEmbedUrl}
          legiscastUrl={legiscastEmbedUrl}
          esquematizadaUrl={legislacao.pdfEsquematizadoUrl}
          legislacaoNome={legislacao.nome}
        />

        <section>
          <div className="rounded-lg border border-blue-200/40 bg-white p-5 shadow-[0_18px_45px_rgba(0,0,0,0.26)]">
            <p className="text-sm font-semibold uppercase tracking-wide text-[#062a5f]">
              Última alteração legislativa
            </p>
            <p className="mt-3 rounded bg-slate-100 px-4 py-3 text-base font-bold text-slate-950">
              {legislacao.ultimaAlteracaoLegislativa}
            </p>
          </div>
        </section>

        <section className="flex flex-col items-center rounded-lg bg-[#062a5f] p-6 text-center text-white shadow-[0_18px_45px_rgba(0,0,0,0.28)]">
          <a
            href={legislacao.hotmartUrl}
            className="inline-flex w-fit items-center justify-center rounded-lg bg-[#062a5f] px-7 py-4 text-sm font-black text-white shadow-lg ring-1 ring-white/20 hover:bg-blue-900 sm:text-base"
          >
            Adquirir Material Completo
          </a>
          <div className="mt-5 rounded border border-white/15 bg-black/20 px-4 py-3 text-sm font-semibold leading-6 text-blue-50">
            ∞ Acesso Vitalício • ⬇️ Acesso Ilimitado • 🔄 Sempre Atualizado*
          </div>
          <p className="mt-3 text-xs leading-5 text-blue-100">
            * Atualizações de legislações específicas podem depender de
            solicitação do aluno.
          </p>
        </section>
      </div>
    </div>
  );
}
