import Script from "next/script";
import { notFound } from "next/navigation";
import {
  encontrarLegislacaoPorSlug,
  filtrarLegislacoesAtivas,
  getLegislacoes,
} from "@/lib/legislacoes";

type PagamentoPageProps = {
  params: Promise<{
    slug: string;
  }>;
};

function adicionarCheckoutModeWidget(hotmartUrl: string) {
  if (!hotmartUrl) {
    return hotmartUrl;
  }

  try {
    const url = new URL(hotmartUrl);

    if (url.searchParams.get("checkoutMode") !== "2") {
      url.searchParams.set("checkoutMode", "2");
    }

    return url.toString();
  } catch {
    if (hotmartUrl.includes("checkoutMode=2")) {
      return hotmartUrl;
    }

    const separador = hotmartUrl.includes("?") ? "&" : "?";
    return `${hotmartUrl}${separador}checkoutMode=2`;
  }
}

function escaparAtributoHtml(valor: string) {
  return valor
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

export async function generateStaticParams() {
  const legislacoes = await getLegislacoes();

  return filtrarLegislacoesAtivas(legislacoes).map((legislacao) => ({
    slug: legislacao.slug,
  }));
}

export default async function PagamentoPage({ params }: PagamentoPageProps) {
  const { slug } = await params;
  const legislacoes = await getLegislacoes();
  const legislacao = encontrarLegislacaoPorSlug(legislacoes, slug);

  if (!legislacao) {
    notFound();
  }

  const hotmartCheckoutUrl = adicionarCheckoutModeWidget(legislacao.hotmartUrl);
  const hotmartCheckoutUrlEscapada = escaparAtributoHtml(hotmartCheckoutUrl);

  return (
    <div className="bg-[#eef2f7]">
      <link
        rel="stylesheet"
        href="https://static.hotmart.com/css/hotmart-fb.min.css"
      />
      <Script
        src="https://static.hotmart.com/checkout/widget.min.js"
        strategy="afterInteractive"
      />

      <div className="mx-auto min-h-[calc(100vh-220px)] max-w-6xl px-5 py-8 sm:px-6 sm:py-10">
        <div className="mb-6">
          <a
            href={`/leisflashcards/${legislacao.slug}`}
            className="text-sm font-semibold text-blue-700 hover:text-blue-900"
          >
            Voltar para a legislacao
          </a>

          <div className="mt-5 grid gap-5 lg:grid-cols-[1fr_280px] lg:items-end">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.18em] text-blue-700">
                Teste de pagamento
              </p>
              <h1 className="mt-2 text-3xl font-bold text-slate-950 sm:text-4xl">
                {legislacao.nome}
              </h1>
              <p className="mt-3 max-w-3xl text-base leading-7 text-slate-600">
                {legislacao.descricaoCurta}
              </p>
            </div>

            <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
              <p className="text-sm font-semibold uppercase tracking-wide text-slate-500">
                {legislacao.unidade}
              </p>
              <p className="mt-2 text-4xl font-black text-[#062a5f]">
                {legislacao.quantidadeFlashcards}
              </p>
            </div>
          </div>
        </div>

        <section className="rounded-lg border border-slate-200 bg-white p-6 text-center shadow-sm">
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-blue-700">
            Checkout Hotmart
          </p>
          <h2 className="mt-2 text-2xl font-bold text-slate-950">
            Finalizar compra
          </h2>
          <p className="mx-auto mt-3 max-w-2xl text-sm leading-6 text-slate-600">
            Ao clicar, o checkout seguro da Hotmart sera aberto como widget
            oficial, usando o link cadastrado na planilha.
          </p>

          <div
            className="mt-6 flex justify-center"
            dangerouslySetInnerHTML={{
              __html: `<a onclick="return false;" href="${hotmartCheckoutUrlEscapada}" class="hotmart-fb hotmart__button-checkout">Comprar Agora</a>`,
            }}
          />

          <p className="mt-5 text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
            Pagamento seguro processado pela Hotmart
          </p>
        </section>
      </div>
    </div>
  );
}
