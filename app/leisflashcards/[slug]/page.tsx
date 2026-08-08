import { notFound, redirect } from "next/navigation";
import {
  encontrarLegislacaoPorSlug,
  getVadeMecumHotmartUrl,
  getLegislacoes,
  getYoutubeEmbedUrl,
  isVadeMecum,
  type StatusAtualizacao,
} from "@/lib/legislacoes";
import { siteConfig } from "@/lib/site-config";
import { getSupabaseServerClient } from "@/lib/supabase-server";

// As quantidades comerciais dos materiais podem ser atualizadas pelo painel.
// A página deve consultar o estado atual, em vez do snapshot do build.
export const dynamic = "force-dynamic";

type LegislacaoPageProps = {
  params: Promise<{
    slug: string;
  }>;
};

type ProdutoCatalogo = {
  nome: string;
  descricao: string | null;
  hotmartUrl: string | null;
  videoDemoUrl: string | null;
  leis: Array<{ id: number; titulo: string; flashcards: number | null }>;
  totalFlashcards: number | null;
};

async function carregarProdutoCatalogo(slug: string): Promise<ProdutoCatalogo | null> {
  try {
    const supabase = getSupabaseServerClient();
    const produtoComVideo = await supabase
      .from("produtos")
      .select("id,nome,descricao,hotmart_url,video_demo_url")
      .eq("slug", slug)
      .eq("ativo", true)
      .maybeSingle();
    const produto = produtoComVideo.error
      ? await supabase
          .from("produtos")
          .select("id,nome,descricao,hotmart_url")
          .eq("slug", slug)
          .eq("ativo", true)
          .maybeSingle()
      : produtoComVideo;
    if (produto.error || !produto.data) return null;

    const vinculos = await supabase
      .from("produto_leis")
      .select("lei_id,ordem,leis(id,titulo,nome_curto)")
      .eq("produto_id", produto.data.id)
      .order("ordem");
    if (vinculos.error) return null;
    const leiIds = (vinculos.data ?? []).map((vinculo) => Number(vinculo.lei_id));
    const materiais = leiIds.length
      ? await supabase.from("materiais_leis").select("lei_id,quantidade_itens").in("lei_id", leiIds).eq("tipo", "flashcards").eq("ativo", true)
      : { data: [], error: null };
    if (materiais.error) return null;

    const quantidades = new Map<number, number>();
    const comQuantidade = new Set<number>();
    for (const material of materiais.data ?? []) {
      if (typeof material.quantidade_itens === "number") {
        const leiId = Number(material.lei_id);
        quantidades.set(leiId, (quantidades.get(leiId) ?? 0) + material.quantidade_itens);
        comQuantidade.add(leiId);
      }
    }
    const leis = (vinculos.data ?? []).map((vinculo) => {
      const lei = Array.isArray(vinculo.leis) ? vinculo.leis[0] : vinculo.leis;
      const leiId = Number(vinculo.lei_id);
      return {
        id: leiId,
        titulo: lei?.nome_curto || lei?.titulo || "Lei não identificada",
        flashcards: comQuantidade.has(leiId) ? quantidades.get(leiId) ?? 0 : null,
      };
    });
    const totalFlashcards = leis.every((lei) => lei.flashcards !== null)
      ? leis.reduce((total, lei) => total + (lei.flashcards ?? 0), 0)
      : null;
    const videoDemoUrl =
      "video_demo_url" in produto.data && typeof produto.data.video_demo_url === "string"
        ? produto.data.video_demo_url
        : null;
    return { nome: produto.data.nome, descricao: produto.data.descricao, hotmartUrl: produto.data.hotmart_url, videoDemoUrl, leis, totalFlashcards };
  } catch {
    return null;
  }
}

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
  let slugsProdutos: string[] = [];

  try {
    const { data } = await getSupabaseServerClient()
      .from("produtos")
      .select("slug")
      .eq("ativo", true)
      .not("slug", "is", null);
    slugsProdutos = (data ?? [])
      .map((produto) => produto.slug)
      .filter((slug): slug is string => Boolean(slug));
  } catch {
    // A página continua disponível para as leis já conhecidas quando o catálogo não está acessível no build.
  }

  return slugsProdutos.map((slug) => ({ slug }));
}

export default async function LegislacaoPage({ params }: LegislacaoPageProps) {
  const { slug } = await params;
  const produto = await carregarProdutoCatalogo(slug);

  if (produto) {
    const videoUrl = !produto.videoDemoUrl && produto.leis.length === 1
      ? encontrarLegislacaoPorSlug(await getLegislacoes(), slug)?.youtubeUrl ?? null
      : null;
    return <PaginaProduto produto={produto} videoUrl={videoUrl} />;
  }

  const legislacoes = await getLegislacoes();
  const legislacao = encontrarLegislacaoPorSlug(legislacoes, slug);

  if (!legislacao) {
    notFound();
  }

  if (isVadeMecum(legislacao)) {
    const hotmartUrl = getVadeMecumHotmartUrl(legislacao);

    if (hotmartUrl) {
      redirect(hotmartUrl);
    }

    notFound();
  }

  const youtubeEmbedUrl = getYoutubeEmbedUrl(legislacao.youtubeUrl);
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
                {legislacao.unidade}
              </p>
              <p className="mt-3 text-4xl font-black text-[#062a5f] sm:text-5xl">
                + de {legislacao.quantidadeFlashcards}
              </p>
            </div>
          </div>
        </div>

        <section>
          <div className="overflow-hidden rounded-lg border border-slate-700 bg-black shadow-[0_18px_45px_rgba(0,0,0,0.28)]">
            <iframe
              className="aspect-video w-full bg-black"
              src={youtubeEmbedUrl}
              title={`Vídeo: ${legislacao.nome}`}
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
              allowFullScreen
            />
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
              className="inline-flex min-h-11 shrink-0 items-center justify-center rounded-lg border border-orange-300 bg-orange-50 px-5 py-3 text-sm font-bold text-orange-700 shadow-sm transition hover:border-orange-400 hover:bg-orange-100 hover:text-orange-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-500 sm:self-stretch"
            >
              🚨 Reportar atualização
            </a>
          </div>

          <details className="group mt-6 overflow-hidden rounded-xl border border-slate-200 bg-white text-slate-800 shadow-[0_14px_34px_rgba(0,0,0,0.2)] transition open:border-blue-200 open:shadow-[0_20px_48px_rgba(0,0,0,0.28)]">
            <summary className="flex cursor-pointer list-none items-center gap-4 px-5 py-5 transition hover:bg-blue-50/80 marker:hidden sm:px-6">
              <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#062a5f] text-lg font-black text-white shadow-sm">
                ?
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-base font-black leading-snug text-[#062a5f] sm:text-lg">
                  Como saber se meus flashcards estão atualizados?
                </span>
              </span>
              <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-blue-200 bg-blue-50 text-xl font-bold text-[#062a5f] transition group-open:bg-[#062a5f] group-open:text-white">
                <span className="group-open:hidden" aria-hidden="true">
                  +
                </span>
                <span className="hidden group-open:inline" aria-hidden="true">
                  −
                </span>
              </span>
            </summary>

            <div className="space-y-7 border-t border-slate-200 bg-slate-50/70 px-5 py-6 sm:px-6 sm:py-7">
              <div className="space-y-3">
              <p className="leading-7 text-slate-700">
                Compare a alteração legislativa exibida no topo do seu
                flashcard com a Última Alteração Legislativa informada nesta
                página.
              </p>
              <p className="font-bold leading-7 text-slate-900">
                Se ambas forem iguais, seus flashcards já estão atualizados.
              </p>
            </div>

            <div className="space-y-4">
              <h2 className="text-xl font-black text-[#062a5f] sm:text-2xl">
                Meu flashcard está desatualizado. Como atualizar?
              </h2>
              <p className="leading-7 text-slate-700">
                Se o seu flashcard indicar uma alteração legislativa diferente
                da exibida acima, siga estes passos:
              </p>
              <ol className="list-decimal space-y-3 pl-6 leading-7 text-slate-700 marker:font-bold marker:text-[#062a5f]">
                <li>Exclua o deck desatualizado do Anki.</li>
                <li>
                  Acesse &quot;🔐 Minhas Leis Adquiridas&quot; no site da
                  LegisFlashcards.
                </li>
                <li>Baixe a versão mais recente dos flashcards.</li>
                <li>
                  Importe o novo arquivo no Anki conforme o passo a passo
                  ensinado no curso.
                </li>
              </ol>
            </div>

            <div className="rounded-lg border border-amber-300 bg-amber-50 p-5 text-amber-900">
              <p className="font-black">Importante:</p>
              <p className="mt-2 leading-7">
                Para evitar conflitos e manter seu material sincronizado com a
                versão mais recente, sempre remova a versão antiga antes de
                importar a nova.
              </p>
            </div>

            <a
              href={siteConfig.links.minhasLeis}
              target="_blank"
              rel="noreferrer"
              className="inline-flex min-h-11 w-full items-center justify-center rounded-lg bg-[#062a5f] px-5 py-3 text-sm font-bold text-white shadow-sm transition hover:bg-[#041d42] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500 sm:w-auto"
            >
              🔐 Acessar Minhas Leis Adquiridas
            </a>
            </div>
          </details>
        </section>

      </div>
    </div>
  );
}

function PaginaProduto({ produto, videoUrl }: { produto: ProdutoCatalogo; videoUrl: string | null }) {
  const selectedVideoUrl = produto.videoDemoUrl ?? videoUrl;
  const video = selectedVideoUrl ? getYoutubeEmbedUrl(selectedVideoUrl) : null;
  const isLeiAvulsa = produto.leis.length === 1;
  const resumoLeis = produto.leis.length > 1
    ? `${produto.leis.length} leis${produto.totalFlashcards !== null ? ` · ${produto.totalFlashcards.toLocaleString("pt-BR")} flashcards` : ""}`
    : null;
  return <div className="bg-[#171a21] text-white">
    <div className="mx-auto flex max-w-6xl flex-col gap-8 px-5 py-10 sm:px-6 sm:py-14">
      <a href="/" className="text-sm font-semibold text-slate-300 hover:text-blue-300">← Voltar para a Home</a>
      <section className="space-y-5">
        <div className="space-y-5">
          <p className="text-sm font-semibold uppercase tracking-wide text-blue-300">Legis Flashcards</p>
          <h1 className="text-4xl font-bold leading-tight sm:text-5xl">{produto.nome}</h1>
          {produto.descricao ? <p className="max-w-2xl text-lg leading-8 text-slate-200">{produto.descricao}</p> : null}
          {produto.hotmartUrl ? <a href={produto.hotmartUrl} className="inline-flex w-fit items-center justify-center rounded-lg bg-gradient-to-r from-[#062a5f] to-blue-600 px-8 py-5 text-base font-black text-white shadow-[0_18px_40px_rgba(37,99,235,0.42)] ring-1 ring-white/20 transition hover:scale-[1.02] sm:text-lg">Adquirir acesso</a> : <p className="text-sm font-semibold text-slate-300">Link de aquisição indisponível no momento.</p>}
        </div>
      </section>
      <section className="grid gap-4 sm:grid-cols-3">{["Acesso vitalício", "Acesso ilimitado", "Material atualizado"].map((beneficio) => <div key={beneficio} className="rounded-lg border border-slate-700 bg-slate-900/70 p-5 font-bold shadow-[0_16px_40px_rgba(0,0,0,0.22)]">{beneficio}</div>)}</section>
      <section className="space-y-5"><div className="flex flex-wrap items-end justify-between gap-3"><div><p className="text-sm font-semibold uppercase tracking-wide text-blue-300">Conteúdo incluído</p><h2 className="mt-1 text-2xl font-black">Leis do produto</h2></div>{!isLeiAvulsa && resumoLeis ? <p className="font-black text-slate-200">{resumoLeis}</p> : null}</div>
        {produto.leis.length ? <div className="grid gap-3 sm:grid-cols-2">{produto.leis.map((lei) => <article key={lei.id} className="flex items-center justify-between gap-4 rounded-lg border border-slate-700 bg-white p-5 text-slate-950"><h3 className="font-black">{lei.titulo}</h3>{lei.flashcards !== null ? <p className="shrink-0 text-sm font-bold text-[#062a5f]">{lei.flashcards.toLocaleString("pt-BR")} flashcards</p> : null}</article>)}</div> : <p className="rounded-lg border border-slate-700 bg-slate-900/70 p-5 text-slate-200">Este produto ainda não possui leis vinculadas.</p>}</section>
      {video ? <section className="space-y-3"><p className="text-sm font-semibold uppercase tracking-wide text-blue-300">Demonstração</p><div className="overflow-hidden rounded-lg border border-slate-700 bg-black"><iframe className="aspect-video w-full" src={video} title={`Demonstração: ${produto.nome}`} allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowFullScreen /></div></section> : null}
    </div>
  </div>;
}
