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
    slug: string;
  }>;
};

export async function generateStaticParams() {
  const legislacoes = await getLegislacoes();

  return filtrarLegislacoesAtivas(legislacoes).map((legislacao) => ({
    slug: legislacao.slug,
  }));
}

export default async function LegislacaoPage({ params }: LegislacaoPageProps) {
  const { slug } = await params;
  const legislacoes = await getLegislacoes();
  const legislacao = encontrarLegislacaoPorSlug(legislacoes, slug);

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
              <p className="mt-3 text-4xl font-black text-[#062a5f] sm:text-5xl">
                {legislacao.quantidadeFlashcards}{" "}
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
            className="inline-flex w-fit items-center justify-center rounded-lg bg-gradient-to-r from-[#062a5f] to-blue-600 px-8 py-5 text-base font-black text-white shadow-[0_18px_40px_rgba(37,99,235,0.42)] ring-1 ring-white/20 transition hover:scale-[1.02] hover:from-[#041d42] hover:to-blue-500 hover:shadow-[0_22px_50px_rgba(37,99,235,0.52)] sm:px-10 sm:text-lg"
          >
            Adquirir Material Completo
          </a>
          <p className="mt-3 text-xs font-semibold text-blue-100">
            🔒 Pagamento seguro via Hotmart
          </p>
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
