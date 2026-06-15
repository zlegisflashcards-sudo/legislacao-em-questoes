"use client";

import { useMemo, useState } from "react";
import type { Legislacao } from "@/lib/legislacoes";

type HomeCategoria = {
  label: string;
  categoria: string;
};

const homeCategorias: HomeCategoria[] = [
  { label: "Constituição", categoria: "Constituição Federal" },
  { label: "Códigos", categoria: "Códigos" },
  { label: "Legislações", categoria: "Legislações" },
  { label: "Tratados", categoria: "Tratados" },
  {
    label: "Legislações Específicas",
    categoria: "Legislações Específicas",
  },
];

function HomeLegislacaoCard({ legislacao }: { legislacao: Legislacao }) {
  return (
    <article className="flex min-h-[260px] flex-col overflow-hidden rounded-lg bg-white shadow-[0_18px_45px_rgba(0,0,0,0.28)] ring-1 ring-black/5">
      <div className="flex min-h-[82px] items-center bg-[#062a5f] px-5 py-4">
        <h3 className="text-lg font-bold leading-snug text-white">
          {legislacao.nome}
        </h3>
      </div>

      <div className="flex flex-1 flex-col justify-between gap-6 p-5">
        <p className="text-sm leading-6 text-slate-700">
          {legislacao.descricaoCurta}
        </p>

        <div className="flex items-center justify-between gap-4 border-t border-slate-200 pt-4">
          <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-slate-800">
            <span className="text-base leading-none text-sky-400">⚡</span>
            {legislacao.quantidadeFlashcards} flashcards
          </span>
          <a
            href={`/leisflashcards/${legislacao.slug}`}
            className="text-sm font-bold text-[#062a5f] hover:text-blue-800"
          >
            Saber mais
          </a>
        </div>
      </div>
    </article>
  );
}

export function HomeCategoriasVadeMecum({
  legislacoes,
}: {
  legislacoes: Legislacao[];
}) {
  const [categoriaAtiva, setCategoriaAtiva] = useState(homeCategorias[0]);

  const legislacoesDaCategoria = useMemo(
    () =>
      legislacoes.filter(
        (legislacao) => legislacao.categoria === categoriaAtiva.categoria,
      ),
    [categoriaAtiva, legislacoes],
  );

  return (
    <section className="space-y-6">
      <div className="flex flex-wrap items-end gap-2 border-b border-slate-700/80">
        {homeCategorias.map((categoria) => {
          const isActive = categoria.label === categoriaAtiva.label;

          return (
            <button
              key={categoria.label}
              type="button"
              onClick={() => setCategoriaAtiva(categoria)}
              className={[
                "relative rounded-t-lg px-4 py-3 text-sm font-bold text-white shadow-md transition sm:px-5",
                isActive
                  ? "-mb-px translate-y-px bg-[#062a5f] shadow-[0_14px_30px_rgba(6,42,95,0.35)] ring-1 ring-blue-300/30"
                  : "bg-slate-600 hover:-translate-y-0.5 hover:bg-slate-500",
              ].join(" ")}
            >
              {categoria.label}
            </button>
          );
        })}
      </div>

      {legislacoesDaCategoria.length > 0 ? (
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {legislacoesDaCategoria.map((legislacao) => (
            <HomeLegislacaoCard
              key={legislacao.slug}
              legislacao={legislacao}
            />
          ))}
        </div>
      ) : (
        <div className="rounded-lg border border-slate-700 bg-slate-900/80 p-6 text-sm text-slate-200 shadow-lg">
          Ainda não há legislações ativas nesta categoria.
        </div>
      )}
    </section>
  );
}
