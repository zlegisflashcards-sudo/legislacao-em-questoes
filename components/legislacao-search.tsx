"use client";

import { useMemo, useState } from "react";
import {
  getVadeMecumHotmartUrl,
  isVadeMecum,
  type Legislacao,
} from "@/lib/legislacoes";
import { matchesLegislationSearch, normalizeLegislationSearch } from "@/lib/legislation-search";

type LegislacaoSearchProps = {
  legislacoes?: Legislacao[];
  produtos?: Array<{ nome: string; slug: string }>;
  variant?: "light" | "dark";
};

export function LegislacaoSearch({
  legislacoes = [],
  produtos = [],
  variant = "light",
}: LegislacaoSearchProps) {
  const [query, setQuery] = useState("");
  const normalizedQuery = normalizeLegislationSearch(query);
  const isDark = variant === "dark";

  const sugestoes = useMemo(() => {
    if (normalizedQuery.length < 2) {
      return [];
    }

    return legislacoes
      .filter((legislacao) => matchesLegislationSearch(legislacao, query))
      .slice(0, 6);
  }, [legislacoes, normalizedQuery]);

  const sugestoesProdutos = useMemo(() => {
    if (normalizedQuery.length < 2) {
      return [];
    }

    return produtos
      .filter((produto) => normalizeLegislationSearch(produto.nome).includes(normalizedQuery))
      .slice(0, 6);
  }, [produtos, normalizedQuery]);

  const shouldShowEmptyState =
    normalizedQuery.length >= 2 && sugestoes.length === 0 && sugestoesProdutos.length === 0;

  return (
    <div
      className={
        isDark
          ? "w-full"
          : "rounded-xl bg-white p-5 sm:p-6"
      }
    >
      {!isDark ? (
        <label
          htmlFor="busca-legislacao"
          className="mb-3 block text-sm font-bold uppercase tracking-wide text-[#07306b]"
        >
          Pesquisar legislação
        </label>
      ) : null}

      <div className="relative">
        <input
          id="busca-legislacao"
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Digite o nome da legislação"
          autoComplete="off"
          className={
            isDark
              ? "h-16 w-full rounded-lg border border-blue-300/40 bg-black/45 px-5 text-lg font-semibold text-white outline-none shadow-[0_0_36px_rgba(37,99,235,0.32)] transition placeholder:text-slate-400 focus:border-blue-400 focus:bg-black/60 focus:ring-4 focus:ring-blue-500/20"
              : "h-14 w-full rounded-lg border border-slate-300 bg-slate-50 px-4 text-base font-medium text-slate-950 outline-none transition placeholder:text-slate-400 focus:border-[#07306b] focus:bg-white focus:ring-4 focus:ring-blue-100"
          }
        />

        {(sugestoesProdutos.length > 0 || sugestoes.length > 0 || shouldShowEmptyState) && (
          <div className="absolute left-0 right-0 top-16 z-10 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-2xl">
            {sugestoesProdutos.length > 0 ? (
              <ul>
                {sugestoesProdutos.map((produto) => (
                  <li key={produto.slug}>
                    <a
                      href={`/leisflashcards/${produto.slug}`}
                      className="block px-4 py-3 transition hover:bg-blue-50"
                    >
                      <span className="block text-sm font-bold text-slate-950">
                        {produto.nome}
                      </span>
                      <span className="mt-1 block text-xs text-slate-600">
                        Produto LegisFlashcards
                      </span>
                    </a>
                  </li>
                ))}
              </ul>
            ) : null}
            {sugestoes.length > 0 ? (
              <ul>
                {sugestoes.map((legislacao) => {
                  const isProdutoPorConcurso = isVadeMecum(legislacao);
                  const hotmartUrl = getVadeMecumHotmartUrl(legislacao);
                  const produtoInterno = produtos.find(
                    (produto) =>
                      normalizeLegislationSearch(produto.nome) ===
                      normalizeLegislationSearch(legislacao.nome),
                  );
                  const href = produtoInterno
                    ? `/leisflashcards/${produtoInterno.slug}`
                    : isProdutoPorConcurso
                      ? hotmartUrl!
                      : `/leisflashcards/${legislacao.slug}`;
                  const content = (
                    <>
                      <span className="block text-sm font-bold text-slate-950">
                        {legislacao.nome}
                      </span>
                      <span className="mt-1 block text-xs text-slate-600">
                        {legislacao.categoria}{" "}
                        ·{" "}
                        {legislacao.quantidadeFlashcards} {legislacao.unidade}
                      </span>
                    </>
                  );

                  return (
                    <li key={legislacao.slug}>
                      {isProdutoPorConcurso && !hotmartUrl && !produtoInterno ? (
                        <div
                          aria-disabled="true"
                          className="flex cursor-not-allowed items-center justify-between gap-4 px-4 py-3 opacity-60"
                        >
                          <span>{content}</span>
                          <span className="shrink-0 text-xs font-bold text-slate-600">
                            Indisponível
                          </span>
                        </div>
                      ) : (
                        <a
                          href={href}
                          target={
                            isProdutoPorConcurso && !produtoInterno
                              ? "_blank"
                              : undefined
                          }
                          rel={
                            isProdutoPorConcurso && !produtoInterno
                              ? "noopener noreferrer"
                              : undefined
                          }
                          className="block px-4 py-3 transition hover:bg-blue-50"
                        >
                          {content}
                        </a>
                      )}
                    </li>
                  );
                })}
              </ul>
            ) : shouldShowEmptyState ? (
              <p className="px-4 py-3 text-sm text-slate-600">
                Nenhuma legislação ativa encontrada.
              </p>
            ) : null}
          </div>
        )}
      </div>

      {!isDark ? (
        <p className="mt-3 text-sm leading-6 text-slate-600">
          Digite pelo menos 2 letras para ver sugestões.
        </p>
      ) : null}
    </div>
  );
}
