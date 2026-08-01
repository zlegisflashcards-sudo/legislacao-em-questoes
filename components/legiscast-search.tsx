"use client";

import type { KeyboardEvent } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { LegiscastGrid } from "@/components/legiscast-grid";
import type { LegiscastItem } from "@/lib/legiscast";

const LISTBOX_ID = "legiscast-search-results";

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

export function LegiscastSearch({ items }: { items: LegiscastItem[] }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const normalizedQuery = normalizeSearch(query);
  const featured = useMemo(
    () => items.filter((item) => item.destaqueLegiscast).slice(0, 6),
    [items],
  );
  const results = useMemo(
    () => normalizedQuery
      ? items.filter((item) => getSearchText(item).includes(normalizedQuery))
      : [],
    [items, normalizedQuery],
  );
  const showSuggestions = isOpen && normalizedQuery.length > 0;

  useEffect(() => {
    function closeOnOutsidePointer(event: PointerEvent) {
      if (!containerRef.current?.contains(event.target as Node)) {
        setIsOpen(false);
        setActiveIndex(-1);
      }
    }

    document.addEventListener("pointerdown", closeOnOutsidePointer);
    return () => document.removeEventListener("pointerdown", closeOnOutsidePointer);
  }, []);

  useEffect(() => {
    setActiveIndex(-1);
  }, [normalizedQuery]);

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Escape") {
      setIsOpen(false);
      setActiveIndex(-1);
      return;
    }

    if (!normalizedQuery) return;

    if (event.key === "ArrowDown") {
      event.preventDefault();
      setIsOpen(true);
      setActiveIndex((current) =>
        results.length ? (current + 1) % results.length : -1,
      );
      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      setIsOpen(true);
      setActiveIndex((current) =>
        results.length
          ? current <= 0 ? results.length - 1 : current - 1
          : -1,
      );
      return;
    }

    if (event.key === "Enter" && showSuggestions && activeIndex >= 0) {
      event.preventDefault();
      const activeResult = results[activeIndex];
      if (activeResult) {
        setIsOpen(false);
        window.location.assign(`/leis/${encodeURIComponent(activeResult.slug)}`);
      }
    }
  }

  return (
    <div className="space-y-8">
      <div ref={containerRef} className="relative z-20">
        <label htmlFor="legiscast-search" className="sr-only">
          Pesquisar legislação
        </label>
        <input
          id="legiscast-search"
          type="search"
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={showSuggestions}
          aria-controls={LISTBOX_ID}
          aria-activedescendant={
            showSuggestions && activeIndex >= 0
              ? `legiscast-result-${activeIndex}`
              : undefined
          }
          value={query}
          onChange={(event) => {
            const nextQuery = event.target.value;
            setQuery(nextQuery);
            setIsOpen(normalizeSearch(nextQuery).length > 0);
          }}
          onFocus={() => {
            if (normalizedQuery) setIsOpen(true);
          }}
          onPointerDown={() => {
            if (normalizedQuery) setIsOpen(true);
          }}
          onKeyDown={handleKeyDown}
          placeholder="Pesquisar legislação..."
          autoComplete="off"
          className="h-14 w-full rounded-xl border border-blue-300/25 bg-[#0f1d31] px-5 text-base font-semibold text-white shadow-[0_10px_30px_rgba(0,0,0,0.18)] outline-none transition placeholder:text-slate-400 focus:border-[#28b7ff] focus:ring-4 focus:ring-blue-500/20 sm:h-16 sm:text-lg"
        />

        {showSuggestions ? (
          <ul
            id={LISTBOX_ID}
            role="listbox"
            aria-label="Sugestões de legislações"
            className="absolute left-0 right-0 top-full z-50 mt-2 max-h-80 overflow-y-auto rounded-xl border border-blue-300/25 bg-[#0f1d31] p-1.5 shadow-[0_22px_54px_rgba(0,0,0,0.48)]"
          >
            {results.length ? results.map((item, index) => (
              <li key={item.slug} role="none">
                <a
                  id={`legiscast-result-${index}`}
                  role="option"
                  aria-selected={activeIndex === index}
                  href={`/leis/${encodeURIComponent(item.slug)}`}
                  onMouseEnter={() => setActiveIndex(index)}
                  onClick={() => setIsOpen(false)}
                  className={`block min-h-11 rounded-lg px-4 py-3 text-sm font-bold leading-5 text-slate-100 outline-none transition sm:text-base ${
                    activeIndex === index
                      ? "bg-blue-600 text-white"
                      : "hover:bg-blue-950 focus-visible:bg-blue-600 focus-visible:text-white"
                  }`}
                >
                  {item.titulo}
                </a>
              </li>
            )) : (
              <li
                role="option"
                aria-selected="false"
                aria-disabled="true"
                className="px-4 py-4 text-sm font-semibold text-slate-300"
              >
                Nenhuma legislação encontrada.
              </li>
            )}
          </ul>
        ) : null}
      </div>

      <section aria-labelledby="legiscast-grid-title" className="space-y-5">
        <h2 id="legiscast-grid-title" className="text-xl font-black text-white sm:text-2xl">
          Legislações
        </h2>
        <LegiscastGrid items={featured} />
      </section>
    </div>
  );
}
