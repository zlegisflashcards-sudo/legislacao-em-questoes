import { notFound } from "next/navigation";
import { AcompanharAtualizacoesForm } from "@/components/acompanhar-atualizacoes-form";
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

function getCategoriaHref(categoria: string) {
  if (categoria === "Constituição Federal") {
    return "/categorias/constituicao-federal";
  }

  if (categoria === "Códigos") {
    return "/categorias/codigos";
  }

  return "/categorias/legislacoes";
}

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

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-8 px-5 py-10 sm:px-6 sm:py-14">
      <div className="space-y-4">
        <a
          href={getCategoriaHref(legislacao.categoria)}
          className="text-sm font-semibold text-blue-700 hover:text-blue-900"
        >
          Voltar para {legislacao.categoria}
        </a>

        <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr] lg:items-end">
          <div className="space-y-3">
            <p className="text-sm font-semibold uppercase tracking-wide text-blue-700">
              {legislacao.categoria}
            </p>
            <h1 className="text-4xl font-bold leading-tight text-slate-950 sm:text-5xl">
              {legislacao.nome}
            </h1>
            <p className="max-w-2xl text-lg leading-8 text-slate-700">
              {legislacao.descricaoCurta}
            </p>
          </div>

          <div className="rounded border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-sm font-semibold text-slate-600">
              Quantidade de flashcards
            </p>
            <p className="mt-2 text-4xl font-bold text-slate-950">
              {legislacao.quantidadeFlashcards}
            </p>
          </div>
        </div>
      </div>

      <section className="overflow-hidden rounded border border-slate-200 bg-black shadow-sm">
        <iframe
          className="aspect-video w-full"
          src={youtubeEmbedUrl}
          title={`Vídeo com questões dos flashcards: ${legislacao.nome}`}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
          allowFullScreen
        />
      </section>

      <section className="grid gap-4 md:grid-cols-3">
        <div className="rounded border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm font-semibold text-slate-600">
            Última alteração legislativa
          </p>
          <p className="mt-2 text-base font-semibold text-slate-950">
            {legislacao.ultimaAlteracaoLegislativa}
          </p>
        </div>

        <div className="rounded border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm font-semibold text-slate-600">
            PDF Esquematizado
          </p>
          {legislacao.pdfEsquematizadoUrl ? (
            <a
              href={legislacao.pdfEsquematizadoUrl}
              className="mt-3 inline-flex text-sm font-semibold text-blue-700 hover:text-blue-900"
            >
              Acessar PDF
            </a>
          ) : (
            <p className="mt-2 text-sm text-slate-600">Não disponível.</p>
          )}
        </div>

        <div className="rounded border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm font-semibold text-slate-600">Legiscast</p>
          {legislacao.legiscastUrl ? (
            <a
              href={legislacao.legiscastUrl}
              className="mt-3 inline-flex text-sm font-semibold text-blue-700 hover:text-blue-900"
            >
              Acessar Legiscast
            </a>
          ) : (
            <p className="mt-2 text-sm text-slate-600">Não disponível.</p>
          )}
        </div>
      </section>

      <section className="flex flex-col gap-4 rounded bg-blue-700 p-6 text-white shadow-sm sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1">
          <h2 className="text-2xl font-bold">Estude com os flashcards</h2>
          <p className="text-sm leading-6 text-blue-50">
            Acesse o material completo pela Hotmart.
          </p>
        </div>
        <a
          href={legislacao.hotmartUrl}
          className="inline-flex w-fit items-center justify-center rounded bg-white px-5 py-3 text-sm font-bold text-blue-700 hover:bg-blue-50"
        >
          Comprar
        </a>
      </section>

      <AcompanharAtualizacoesForm
        legislacaoCodigo={legislacao.slug}
        legislacaoNome={legislacao.nome}
      />
    </div>
  );
}
