"use client";

import { useMemo } from "react";
import { LegislacaoSearch } from "@/components/legislacao-search";
import {
  getVadeMecumHotmartUrl,
  isVadeMecum,
  type Legislacao,
} from "@/lib/legislacoes";
import { siteConfig } from "@/lib/site-config";

type CatalogProduct = {
  id: string;
  nome: string;
  slug: string;
  leisIncluidas: number;
  totalFlashcards: number | null;
};

function isConstituicaoFederal(legislacao: Legislacao) {
  return legislacao.categoria === "Constituição Federal";
}

function HomeLegislacaoCard({ legislacao }: { legislacao: Legislacao }) {
  const isProdutoPorConcurso = isVadeMecum(legislacao);
  const hotmartUrl = getVadeMecumHotmartUrl(legislacao);
  const saibaMaisUrl = isProdutoPorConcurso
    ? hotmartUrl
    : isConstituicaoFederal(legislacao)
      ? "/constituicao-federal-gratis"
      : `/leisflashcards/${legislacao.slug}`;

  return (
    <article className="relative flex min-h-[320px] flex-col overflow-hidden rounded-[22px] border border-[#1683ff] bg-white shadow-[0_16px_38px_rgba(0,104,237,0.17)] transition duration-200 hover:-translate-y-1 hover:shadow-[0_20px_46px_rgba(0,104,237,0.25)]">
      <div className="flex min-h-[64px] items-center justify-between gap-3 bg-gradient-to-r from-[#123c74] to-[#07172d] px-5 py-3 text-white">
        <div className="flex min-w-0 items-center gap-3">
          <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-[#1683ff] bg-[#062a5f] text-base text-[#28b7ff] shadow-[0_0_14px_rgba(40,183,255,0.28)]">
            ⚡︎
          </span>
          <span className="truncate text-sm font-bold">Legislação em Questões</span>
        </div>
        <span className="shrink-0 text-xs font-bold text-slate-300">4.0</span>
      </div>

      <div className="flex flex-1 flex-col justify-between p-6">
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            {isConstituicaoFederal(legislacao) && (
              <img
                src="/bandeira-brasil.svg"
                alt="Bandeira do Brasil"
                className="h-7 w-10 shrink-0 rounded-sm object-cover shadow-sm"
              />
            )}
            <h3 className="text-xl font-extrabold leading-snug text-[#0868ed] sm:text-2xl">
              {legislacao.nome}
            </h3>
          </div>
          <p className="text-sm leading-6 text-slate-700">
            {legislacao.descricaoCurta}
          </p>
        </div>

        {isConstituicaoFederal(legislacao) ? (
          <a
            href="/constituicao-federal-gratis"
            className="mt-7 inline-flex min-h-14 w-full items-center justify-center rounded-2xl bg-green-500 px-5 text-center text-sm font-extrabold text-white shadow-[0_12px_26px_rgba(34,197,94,0.3)] transition hover:-translate-y-0.5 hover:bg-green-400 hover:shadow-[0_16px_32px_rgba(34,197,94,0.4)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-green-500"
          >
            Acessar gratuitamente
          </a>
        ) : (
          <div className="mt-7 grid grid-cols-2 gap-3">
            <span className="inline-flex min-h-12 items-center justify-center rounded-2xl border border-[#0877ff] px-3 text-center text-sm font-bold text-[#0868ed]">
              {legislacao.quantidadeFlashcards} {legislacao.unidade}
            </span>
            {isProdutoPorConcurso && !hotmartUrl ? (
              <button
                type="button"
                disabled
                className="relative z-20 inline-flex min-h-12 cursor-not-allowed items-center justify-center rounded-2xl border border-[#0877ff] px-3 text-center text-sm font-bold text-[#0868ed] opacity-50"
              >
                Indisponível
              </button>
            ) : (
              <a
                href={saibaMaisUrl!}
                target={isProdutoPorConcurso ? "_blank" : undefined}
                rel={isProdutoPorConcurso ? "noopener noreferrer" : undefined}
                className="relative z-20 inline-flex min-h-12 items-center justify-center rounded-2xl border border-[#0877ff] px-3 text-center text-sm font-bold text-[#0868ed] transition hover:bg-[#0868ed] hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0868ed]"
              >
                Saiba mais
              </a>
            )}
          </div>
        )}
      </div>
    </article>
  );
}

function HomeProductCard({ produto }: { produto: CatalogProduct }) {
  const quantidadeLeis = `${produto.leisIncluidas} ${produto.leisIncluidas === 1 ? "lei incluída" : "leis incluídas"}`;

  return (
    <article className="relative flex min-h-[320px] flex-col overflow-hidden rounded-[22px] border border-[#1683ff] bg-white shadow-[0_16px_38px_rgba(0,104,237,0.17)] transition duration-200 hover:-translate-y-1 hover:shadow-[0_20px_46px_rgba(0,104,237,0.25)]">
      <div className="flex min-h-[64px] items-center gap-3 bg-gradient-to-r from-[#123c74] to-[#07172d] px-5 py-3 text-white">
        <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-[#1683ff] bg-[#062a5f] text-base text-[#28b7ff] shadow-[0_0_14px_rgba(40,183,255,0.28)]">
          ⚡
        </span>
        <span className="truncate text-sm font-bold">Produto LegisFlashcards</span>
      </div>

      <div className="flex flex-1 flex-col justify-between p-6">
        <div className="space-y-4">
          <h3 className="text-xl font-extrabold leading-snug text-[#0868ed] sm:text-2xl">
            {produto.nome}
          </h3>
          <div className="flex flex-wrap gap-2 text-sm font-bold text-[#0868ed]">
            <span className="rounded-full border border-[#0877ff] px-3 py-1">{quantidadeLeis}</span>
            {produto.totalFlashcards !== null && (
              <span className="rounded-full border border-[#0877ff] px-3 py-1">
                {produto.totalFlashcards} flashcards
              </span>
            )}
          </div>
          <p className="text-sm leading-6 text-slate-700">Acesso vitalício • Material atualizado</p>
        </div>

        <a
          href={`/leisflashcards/${produto.slug}`}
          className="mt-7 inline-flex min-h-12 items-center justify-center rounded-2xl border border-[#0877ff] px-3 text-center text-sm font-bold text-[#0868ed] transition hover:bg-[#0868ed] hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0868ed]"
        >
          Ver produto
        </a>
      </div>
    </article>
  );
}

export function HomeCategoriasVadeMecum({
  legislacoes,
  produtos,
}: {
  legislacoes: Legislacao[];
  produtos: CatalogProduct[];
}) {
  const legislacoesEmDestaque = useMemo(
    () =>
      legislacoes.filter(
        (legislacao) => legislacao.destaqueHome === "Sim",
      ),
    [legislacoes],
  );

  return (
    <div className="space-y-8">
      <div className="max-w-3xl space-y-2">
        <p className="text-xs font-black uppercase tracking-[0.22em] text-blue-300">
          Legislação em Questões
        </p>
        <h1 className="text-2xl font-black leading-tight text-white sm:text-4xl">
          Escolha sua legislação para estudar
        </h1>
      </div>

      <section className="space-y-4 rounded-[22px] border border-blue-300/20 bg-slate-950/70 p-4 shadow-[0_18px_44px_rgba(0,0,0,0.26)] sm:p-6">
        <div className="space-y-1">
          <h2 className="text-xl font-black text-white">
            Buscar legislações e produtos
          </h2>
          <p className="text-sm leading-6 text-slate-300">
            Digite o nome da lei ou produto para encontrar as opções
            disponíveis.
          </p>
        </div>

        <LegislacaoSearch legislacoes={legislacoes} variant="dark" />

        <div className="flex flex-col gap-3 rounded-lg border border-blue-300/20 bg-slate-900/70 px-4 py-4 text-left sm:flex-row sm:items-center sm:justify-between sm:px-5">
          <div className="space-y-1">
            <p className="text-sm font-black text-white">
              Não encontrou sua legislação?
            </p>
            <p className="text-xs leading-5 text-slate-300 sm:text-sm">
              Podemos transformar ela em flashcards, legislação esquematizada e
              Legiscast.
            </p>
          </div>
          <a
            href={siteConfig.links.encomendarLegislacao}
            target="_blank"
            rel="noreferrer"
            className="inline-flex w-full items-center justify-center rounded-lg bg-blue-600 px-5 py-3 text-center text-sm font-black text-white shadow-[0_12px_26px_rgba(37,99,235,0.28)] transition hover:-translate-y-0.5 hover:bg-blue-500 sm:w-auto sm:shrink-0"
          >
            Solicitar orçamento de legislação
          </a>
        </div>
      </section>

      <section className="space-y-5">
        <div className="max-w-3xl space-y-2">
          <p className="text-xs font-black uppercase tracking-[0.22em] text-blue-300">
            Estes produtos estão em alta
          </p>
        </div>

        {produtos.length > 0 ? (
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {produtos.map((produto) => (
              <HomeProductCard key={produto.id} produto={produto} />
            ))}
          </div>
        ) : legislacoesEmDestaque.length > 0 ? (
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {legislacoesEmDestaque.map((legislacao) => (
              <HomeLegislacaoCard
                key={legislacao.slug}
                legislacao={legislacao}
              />
            ))}
          </div>
        ) : (
          <div className="rounded-lg border border-slate-700 bg-slate-900/80 p-6 text-sm text-slate-200 shadow-lg">
            Ainda não há produtos em destaque na página inicial.
          </div>
        )}
      </section>
    </div>
  );
}
