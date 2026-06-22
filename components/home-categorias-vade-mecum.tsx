"use client";

import { useMemo, useState } from "react";
import type { Legislacao } from "@/lib/legislacoes";

type HomeCategoria = {
  label: string;
  id: "constituicao" | "codigos" | "leis" | "vade-mecuns";
};

const homeCategorias: HomeCategoria[] = [
  { label: "Constituição Federal", id: "constituicao" },
  { label: "Códigos", id: "codigos" },
  { label: "Leis", id: "leis" },
  { label: "Vade Mecuns", id: "vade-mecuns" },
];

function isConstituicaoFederal(legislacao: Legislacao) {
  return legislacao.categoria === "Constituição Federal";
}

function HomeLegislacaoCard({ legislacao }: { legislacao: Legislacao }) {
  const saibaMaisUrl = isConstituicaoFederal(legislacao)
    ? "/constituicao-federal-gratis"
    : `/leisflashcards/${legislacao.slug}`;

  return (
    <article className="flex min-h-[320px] flex-col overflow-hidden rounded-[22px] border border-[#1683ff] bg-white shadow-[0_16px_38px_rgba(0,104,237,0.17)] transition duration-200 hover:-translate-y-1 hover:shadow-[0_20px_46px_rgba(0,104,237,0.25)]">
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
            href={saibaMaisUrl}
            className="mt-7 inline-flex min-h-14 w-full items-center justify-center rounded-2xl bg-green-500 px-5 text-center text-sm font-extrabold text-white shadow-[0_12px_26px_rgba(34,197,94,0.3)] transition hover:-translate-y-0.5 hover:bg-green-400 hover:shadow-[0_16px_32px_rgba(34,197,94,0.4)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-green-500"
          >
            Acessar gratuitamente
          </a>
        ) : (
          <div className="mt-7 grid grid-cols-2 gap-3">
            <span className="inline-flex min-h-12 items-center justify-center rounded-2xl border border-[#0877ff] px-3 text-center text-sm font-bold text-[#0868ed]">
              {legislacao.quantidadeFlashcards} {legislacao.unidade}
            </span>
            <a
              href={saibaMaisUrl}
              className="inline-flex min-h-12 items-center justify-center rounded-2xl border border-[#0877ff] px-3 text-center text-sm font-bold text-[#0868ed] transition hover:bg-[#0868ed] hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0868ed]"
            >
              Saiba mais
            </a>
          </div>
        )}
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

  const legislacoesDaCategoria = useMemo(() => {
    if (categoriaAtiva.id === "constituicao") {
      return legislacoes.filter(
        (legislacao) =>
          legislacao.categoriaCatalogo === "leis" &&
          legislacao.categoria === "Constituição Federal",
      );
    }

    if (categoriaAtiva.id === "codigos") {
      return legislacoes.filter(
        (legislacao) =>
          legislacao.categoriaCatalogo === "leis" &&
          legislacao.categoria === "Códigos",
      );
    }

    if (categoriaAtiva.id === "vade-mecuns") {
      return legislacoes.filter(
        (legislacao) => legislacao.categoriaCatalogo === "vade_mecuns",
      );
    }

    return legislacoes.filter(
      (legislacao) =>
        legislacao.categoriaCatalogo === "leis" &&
        legislacao.categoria !== "Constituição Federal" &&
        legislacao.categoria !== "Códigos",
    );
  }, [categoriaAtiva, legislacoes]);

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
          Ainda não há itens ativos nesta categoria.
        </div>
      )}
    </section>
  );
}
