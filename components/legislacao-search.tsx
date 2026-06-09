"use client";

import { useMemo, useState } from "react";
import type { Legislacao } from "@/lib/legislacoes";

type LegislacaoSearchProps = {
  legislacoes: Legislacao[];
};

function normalizeSearch(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

export function LegislacaoSearch({ legislacoes }: LegislacaoSearchProps) {
  const [query, setQuery] = useState("");
  const normalizedQuery = normalizeSearch(query);

  const sugestoes = useMemo(() => {
    if (normalizedQuery.length < 2) {
      return [];
    }

    return legislacoes
      .filter((legislacao) => {
        const nome = normalizeSearch(legislacao.nome);
        const categoria = normalizeSearch(legislacao.categoria);

        return (
          nome.includes(normalizedQuery) ||
          categoria.includes(normalizedQuery)
        );
      })
      .slice(0, 6);
  }, [legislacoes, normalizedQuery]);

  const shouldShowEmptyState =
    normalizedQuery.length >= 2 && sugestoes.length === 0;

  return (
    <div className="rounded border border-slate-200 bg-slate-50 p-4">
      <label
        htmlFor="busca-legislacao"
        className="mb-2 block text-sm font-semibold text-slate-800"
      >
        Pesquisar legislação
      </label>
      <div className="relative">
        <input
          id="busca-legislacao"
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Digite o nome da legislação"
          autoComplete="off"
          className="h-12 w-full rounded border border-slate-300 bg-white px-4 text-base outline-none transition focus:border-blue-700 focus:ring-2 focus:ring-blue-100"
        />

        {(sugestoes.length > 0 || shouldShowEmptyState) && (
          <div className="absolute left-0 right-0 top-14 z-10 overflow-hidden rounded border border-slate-200 bg-white shadow-lg">
            {sugestoes.length > 0 ? (
              <ul>
                {sugestoes.map((legislacao) => (
                  <li key={legislacao.slug}>
                    <a
                      href={`/legislacao/${legislacao.slug}`}
                      className="block px-4 py-3 hover:bg-blue-50"
                    >
                      <span className="block text-sm font-semibold text-slate-950">
                        {legislacao.nome}
                      </span>
                      <span className="mt-1 block text-xs text-slate-600">
                        {legislacao.categoria} ·{" "}
                        {legislacao.quantidadeFlashcards} flashcards
                      </span>
                    </a>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="px-4 py-3 text-sm text-slate-600">
                Nenhuma legislação ativa encontrada.
              </p>
            )}
          </div>
        )}
      </div>
      <p className="mt-3 text-sm leading-6 text-slate-600">
        Digite pelo menos 2 letras para ver sugestões.
      </p>
    </div>
  );
}
