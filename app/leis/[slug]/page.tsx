import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { LegiscastPlaylistPlayer } from "@/components/legiscast-playlist-player";
import { LegislacaoEmbed } from "@/components/legislacao-content-tabs";
import {
  encontrarLegislacaoPorSlug,
  filtrarLegislacoesAtivas,
  getLegislacoes,
  type StatusAtualizacao,
} from "@/lib/legislacoes";

type CentralLegislacaoPageProps = {
  params: Promise<{ slug: string }>;
};

const artigosDemonstrativos = ["Art. 1º", "Art. 2º", "Art. 3º", "Art. 4º"];

function getDestaqueAlteracao(status: StatusAtualizacao) {
  return {
    Atualizado: "border-[#ABEFC6] bg-[#ECFDF3] text-[#067647]",
    "Em produção": "border-[#B2DDFF] bg-[#EFF8FF] text-[#175CD3]",
    "Em atualização": "border-[#FEDF89] bg-[#FFFAEB] text-[#B54708]",
    Indisponível: "border-[#EAECF0] bg-[#F9FAFB] text-[#344054]",
  }[status];
}

export async function generateStaticParams() {
  const legislacoes = await getLegislacoes();

  return filtrarLegislacoesAtivas(legislacoes).map(({ slug }) => ({ slug }));
}

export async function generateMetadata({
  params,
}: CentralLegislacaoPageProps): Promise<Metadata> {
  const { slug } = await params;
  const legislacao = encontrarLegislacaoPorSlug(await getLegislacoes(), slug);

  return legislacao
    ? {
        title: `${legislacao.nome} | Central de estudos`,
        description: legislacao.descricaoCurta,
      }
    : {};
}

export default async function CentralLegislacaoPage({
  params,
}: CentralLegislacaoPageProps) {
  const { slug } = await params;
  const legislacao = encontrarLegislacaoPorSlug(await getLegislacoes(), slug);

  if (!legislacao) notFound();

  const legiscastUrl = legislacao.legiscastUrl?.trim();

  return (
    <div className="bg-[#f7f8fb]">
      <div className="mx-auto flex w-full max-w-6xl min-w-0 flex-col gap-12 px-5 py-10 sm:px-6 sm:py-14 lg:gap-16">
        <header className="space-y-6">
          <div className="space-y-3">
            <p className="text-sm font-bold uppercase tracking-wide text-blue-700">
              Central de estudos
            </p>
            <h1 className="max-w-4xl text-4xl font-black leading-tight text-[#062a5f] sm:text-5xl">
              {legislacao.nome}
            </h1>
            <p className="max-w-3xl text-lg leading-8 text-slate-600">
              {legislacao.descricaoCurta}
            </p>
          </div>

          {legislacao.ultimaAlteracaoLegislativa ? (
            <div
              className={`rounded-lg border p-5 shadow-sm ${getDestaqueAlteracao(legislacao.statusAtualizacao)}`}
            >
              <p className="text-xs font-bold uppercase tracking-wide">
                Última alteração legislativa
              </p>
              <p className="mt-2 text-base font-bold">
                {legislacao.ultimaAlteracaoLegislativa}
              </p>
            </div>
          ) : null}
        </header>

        {legiscastUrl ? (
          <LegiscastPlaylistPlayer
            playlistUrl={legiscastUrl}
            lawSlug={legislacao.slug}
            lawTitle={legislacao.nome}
          />
        ) : null}

        {legislacao.pdfEsquematizadoUrl ? (
          <section className="min-w-0 space-y-5" aria-labelledby="legislacao-title">
            <h2 id="legislacao-title" className="text-3xl font-black text-[#062a5f]">
              Legislação
            </h2>
            <LegislacaoEmbed
              src={legislacao.pdfEsquematizadoUrl}
              title={`Legislação completa: ${legislacao.nome}`}
            />
          </section>
        ) : null}

        <section
          className="min-w-0 rounded-2xl border border-blue-100 bg-white p-6 shadow-[0_18px_50px_rgba(15,23,42,0.08)] sm:p-8"
          aria-labelledby="legisbot-preview-title"
        >
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              <span
                className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-blue-200 bg-gradient-to-br from-blue-50 to-blue-100 text-2xl shadow-sm"
                aria-hidden="true"
              >
                🤖
              </span>
              <h2
                id="legisbot-preview-title"
                className="text-2xl font-black leading-tight text-[#062a5f] sm:text-3xl"
              >
                Legislação comentada pelo LegisBot
              </h2>
            </div>
            <span className="w-fit rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-xs font-black uppercase tracking-wide text-blue-700">
              Em breve
            </span>
          </div>

          <p className="mt-5 max-w-3xl leading-7 text-slate-600">
            Em breve, cada artigo desta legislação poderá ser aberto individualmente
            para visualizar a explicação produzida pelo LegisBot.
          </p>

          <div className="mt-6 flex flex-wrap gap-3" aria-label="Exemplos de artigos">
            {artigosDemonstrativos.map((artigo) => (
              <button
                key={artigo}
                type="button"
                disabled
                className="cursor-not-allowed rounded-xl border border-blue-100 bg-slate-50 px-5 py-3 text-sm font-bold text-slate-400 shadow-sm"
              >
                {artigo}
              </button>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
