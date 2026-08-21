import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { LegisBotCommentsIndex } from "@/components/legisbot-comments-index";
import { LegiscastPlaylistPlayer } from "@/components/legiscast-playlist-player";
import { LegislacaoEmbed } from "@/components/legislacao-content-tabs";
import { buscarComentariosPublicosPorSlug } from "@/lib/legisbot/comentarios-publicos";
import { siteConfig } from "@/lib/site-config";
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
            <h1 className="max-w-4xl text-3xl font-black leading-tight text-[#062a5f] sm:text-4xl">
              {legislacao.nome}
            </h1>
          </div>

          {legislacao.ultimaAlteracaoLegislativa ? (
            <div>
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
              <details className="group overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
                <summary className="flex min-h-11 cursor-pointer list-none items-center gap-3 px-4 py-3 text-sm font-bold text-[#062a5f] transition hover:bg-blue-50/70 marker:hidden focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700">
                  <span className="min-w-0 flex-1">
                    Como conferir se seus flashcards estão atualizados
                  </span>
                  <span
                    className="text-lg leading-none text-blue-700 transition group-open:rotate-180"
                    aria-hidden="true"
                  >
                    ⌄
                  </span>
                </summary>
                <div className="space-y-3 border-t border-slate-200 bg-slate-50/70 px-4 py-4 text-sm leading-6 text-slate-700">
                  <p>
                    Compare a alteração legislativa informada no cabeçalho dos seus
                    flashcards com a Última Alteração Legislativa exibida nesta página.
                  </p>
                  <p>Se as informações forem iguais, seus flashcards estão atualizados.</p>
                  <p>
                    Se forem diferentes, apague o deck antigo do Anki, acesse{" "}
                    <a
                      href="/minhas-leis"
                      className="font-bold text-blue-700 underline decoration-blue-300 underline-offset-2 transition hover:text-blue-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700"
                    >
                      Legis Questões
                    </a>
                    , baixe a versão mais recente dos flashcards e importe novamente o
                    deck atualizado.
                  </p>
                </div>
              </details>
            </div>
          ) : null}

          <aside
            aria-label="Acessos adicionais"
            className="flex flex-col gap-4 rounded-xl border border-blue-100 bg-white px-5 py-4 shadow-sm sm:flex-row sm:items-center sm:justify-between"
          >
            <div>
              <p className="text-sm font-black text-[#062a5f]">
                Clube de membros do LegisCast
              </p>
              <p className="mt-1 text-sm leading-6 text-slate-600">
                Faça parte do nosso clube de membros e apoie este projeto.
              </p>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <a
                href={siteConfig.links.youtubeMembros}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex min-h-11 items-center justify-center rounded-lg bg-blue-700 px-4 text-center text-sm font-black text-white transition hover:bg-blue-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700"
              >
                Seja membro do canal
              </a>
            </div>
          </aside>
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
              restrictDocumentActions
            />
            <aside className="flex flex-col gap-3 rounded-xl border border-blue-100 bg-white px-5 py-4 shadow-sm sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm font-semibold leading-6 text-slate-700">
                Quer estudar esta lei com questões? Conheça os Legis Flashcards.
              </p>
              <a
                href={`/leisflashcards/${encodeURIComponent(legislacao.slug)}`}
                className="inline-flex min-h-10 shrink-0 items-center justify-center rounded-lg border border-blue-200 px-4 py-2 text-center text-sm font-bold text-blue-700 transition hover:border-blue-300 hover:bg-blue-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700"
              >
                Conhecer os Legis Flashcards
              </a>
            </aside>
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
