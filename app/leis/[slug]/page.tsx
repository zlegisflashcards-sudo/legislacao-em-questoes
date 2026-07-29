import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { LegisBotCommentsIndex } from "@/components/legisbot-comments-index";
import { LegiscastPlaylistPlayer } from "@/components/legiscast-playlist-player";
import { LegislacaoEmbed } from "@/components/legislacao-content-tabs";
import { buscarComentariosPublicosPorSlug } from "@/lib/legisbot/comentarios-publicos";
import {
  encontrarLegislacaoPorSlug,
  filtrarLegislacoesAtivas,
  getVadeMecumHotmartUrl,
  getLegislacoes,
  isVadeMecum,
  type StatusAtualizacao,
} from "@/lib/legislacoes";

type CentralLegislacaoPageProps = {
  params: Promise<{ slug: string }>;
};

export const revalidate = 300;

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
  const [legislacoes, comentarios] = await Promise.all([
    getLegislacoes(),
    buscarComentariosPublicosPorSlug(slug),
  ]);
  const legislacao = encontrarLegislacaoPorSlug(legislacoes, slug);

  if (!legislacao) notFound();

  if (isVadeMecum(legislacao)) {
    const hotmartUrl = getVadeMecumHotmartUrl(legislacao);

    if (hotmartUrl) {
      redirect(hotmartUrl);
    }

    notFound();
  }

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

        <LegisBotCommentsIndex
          comentarios={comentarios}
          hotmartUrl={legislacao.hotmartUrl}
          adminSlug={legislacao.slug.trim().toUpperCase()}
        />
      </div>
    </div>
  );
}
