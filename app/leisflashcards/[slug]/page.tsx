import { notFound } from "next/navigation";
import { LegislacaoContentTabs } from "@/components/legislacao-content-tabs";
import {
  encontrarLegislacaoPorSlug,
  filtrarLegislacoesAtivas,
  getLegislacoes,
  getYoutubeEmbedUrl,
  type StatusAtualizacao,
} from "@/lib/legislacoes";

type LegislacaoPageProps = {
  params: Promise<{
    slug: string;
  }>;
};

function getStatusAtualizacaoVisual(status: StatusAtualizacao) {
  const visuals = {
    Atualizado: {
      label: "Atualizado",
      valuePrefix: "",
      cardClass:
        "rounded-lg border border-[#ABEFC6] bg-[#ECFDF3] p-5 text-[#067647] shadow-[0_18px_45px_rgba(0,0,0,0.18)]",
    },
    "Em produção": {
      label: "Em produção",
      valuePrefix: "Previsão: ",
      cardClass:
        "rounded-lg border border-[#B2DDFF] bg-[#EFF8FF] p-5 text-[#175CD3] shadow-[0_18px_45px_rgba(0,0,0,0.18)]",
    },
    "Em atualização": {
      label: "Em atualização",
      valuePrefix: "Previsão: ",
      cardClass:
        "rounded-lg border border-[#FEDF89] bg-[#FFFAEB] p-5 text-[#B54708] shadow-[0_18px_45px_rgba(0,0,0,0.18)]",
    },
    Indisponível: {
      label: "Produção planejada",
      valuePrefix: "Previsão: ",
      cardClass:
        "rounded-lg border border-[#EAECF0] bg-[#F9FAFB] p-5 text-[#344054] shadow-[0_18px_45px_rgba(0,0,0,0.18)]",
    },
  } satisfies Record<
    StatusAtualizacao,
    {
      label: string;
      valuePrefix: string;
      cardClass: string;
    }
  >;

  return visuals[status];
}

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
  const statusAtualizacaoVisual = getStatusAtualizacaoVisual(
    legislacao.statusAtualizacao,
  );
  const nomeLegislacao = legislacao.nome || "Legislação não identificada";
  const slugLegislacao = legislacao.slug || "sem-slug";
  const reportarAtualizacaoSubject = encodeURIComponent(
    `Atualização reportada — ${nomeLegislacao} | ${slugLegislacao}`,
  );
  const reportarAtualizacaoBody = encodeURIComponent(
    "Alteração legislativa identificada:\n\nFonte ou link oficial:\n\nObservações:\n",
  );
  const reportarAtualizacaoUrl = `mailto:zlegisflashcards@gmail.com?subject=${reportarAtualizacaoSubject}&body=${reportarAtualizacaoBody}`;

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
                Quantidade
              </p>
              <p className="mt-3 text-4xl font-black text-[#062a5f] sm:text-5xl">
                {legislacao.quantidadeFlashcards}{" "}
                <span className="text-2xl font-bold text-slate-900">
                  {legislacao.unidade}
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

        <section className="space-y-3">
          <p className="text-sm font-semibold uppercase tracking-wide text-blue-300">
            Última Alteração Legislativa
          </p>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className={`flex-1 ${statusAtualizacaoVisual.cardClass}`}>
              <p className="text-xs font-bold uppercase tracking-wide">
                {statusAtualizacaoVisual.label}
              </p>
              <p className="mt-2 text-base font-bold">
                {statusAtualizacaoVisual.valuePrefix}
                {legislacao.ultimaAlteracaoLegislativa}
              </p>
            </div>
            <a
              href={reportarAtualizacaoUrl}
              className="inline-flex min-h-11 shrink-0 items-center justify-center rounded-lg border border-orange-300 bg-orange-50 px-5 py-3 text-sm font-bold text-orange-700 shadow-sm transition hover:border-orange-400 hover:bg-orange-100 hover:text-orange-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-500 sm:self-center"
            >
              Reportar atualização
            </a>
          </div>
        </section>

        <section className="flex flex-col items-center rounded-lg bg-[#062a5f] p-6 text-center text-white shadow-[0_18px_45px_rgba(0,0,0,0.28)]">
          <a
            href={legislacao.hotmartUrl}
            className="inline-flex w-fit items-center justify-center rounded-lg bg-gradient-to-r from-[#062a5f] to-blue-600 px-8 py-5 text-base font-black text-white shadow-[0_18px_40px_rgba(37,99,235,0.42)] ring-1 ring-white/20 transition hover:scale-[1.02] hover:from-[#041d42] hover:to-blue-500 hover:shadow-[0_22px_50px_rgba(37,99,235,0.52)] sm:px-10 sm:text-lg"
          >
            Adquirir Flashcards
          </a>
          <p className="mt-3 text-xs font-semibold text-blue-100">
            ✓ Pagamento seguro via Hotmart
          </p>
        </section>
      </div>
    </div>
  );
}
