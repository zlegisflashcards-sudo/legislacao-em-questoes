"use client";

import type { ReactNode } from "react";
import { useMemo, useState } from "react";
import { LegiscastGrid } from "@/components/legiscast-grid";
import type { LegiscastItem } from "@/lib/legiscast";

function normalizeSearch(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("pt-BR")
    .trim();
}

function getSearchText(item: LegiscastItem) {
  return normalizeSearch([
    item.titulo,
    item.nome,
    item.numeroLei,
    item.sigla,
    item.slug,
    item.descricao,
    item.termosRelacionados,
  ].filter(Boolean).join(" "));
}

export function LegiscastSearch({
  items,
  afterSearch,
}: {
  items: LegiscastItem[];
  afterSearch?: ReactNode;
}) {
  const [query, setQuery] = useState("");
  const normalizedQuery = normalizeSearch(query);
  const results = useMemo(
    () => normalizedQuery
      ? items.filter((item) => getSearchText(item).includes(normalizedQuery))
      : items,
    [items, normalizedQuery],
  );

  return (
    <div className="space-y-8">
      <div className="relative z-20">
        <label htmlFor="legiscast-search" className="sr-only">
          Pesquise uma lei ou assunto
        </label>
        <input
          id="legiscast-search"
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Pesquise uma lei ou assunto..."
          autoComplete="off"
          className="h-14 w-full rounded-xl border border-blue-300/25 bg-[#0f1d31] px-5 text-base font-semibold text-white shadow-[0_10px_30px_rgba(0,0,0,0.18)] outline-none transition placeholder:text-slate-400 focus:border-[#28b7ff] focus:ring-4 focus:ring-blue-500/20 sm:h-16 sm:text-lg"
        />
      </div>

      {afterSearch}

      <section aria-labelledby="legiscast-grid-title" className="space-y-5">
        <h2 id="legiscast-grid-title" className="text-xl font-black text-white sm:text-2xl">
          Legislações
        </h2>
        {results.length ? (
          <LegiscastGrid items={results} />
        ) : (
          <p className="rounded-xl border border-blue-300/20 bg-[#0f1d31] px-5 py-6 text-sm font-semibold text-slate-300" role="status">
            Nenhum conteúdo encontrado.
          </p>
        )}
      </section>
    </div>
  );
}
