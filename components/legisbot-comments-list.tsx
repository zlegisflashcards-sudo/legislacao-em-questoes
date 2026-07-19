"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { ComentarioPublicoLegisBot } from "@/lib/legisbot/comentarios-publicos";

type LegisBotCommentsListProps = {
  comentarios: ComentarioPublicoLegisBot[];
};

export function normalizarTextoPesquisa(texto: string) {
  return texto
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("pt-BR")
    .trim()
    .replace(/\s+/g, " ");
}

export function getRotuloComentario(
  comentario: Pick<ComentarioPublicoLegisBot, "assunto" | "titulo">,
) {
  return (
    comentario.assunto?.trim() ||
    comentario.titulo?.trim() ||
    "Comentário do LegisBot"
  );
}

export function filtrarComentarios(
  comentarios: ComentarioPublicoLegisBot[],
  pesquisa: string,
) {
  const termoNormalizado = normalizarTextoPesquisa(pesquisa);

  if (!termoNormalizado) return comentarios;

  return comentarios.filter((comentario) => {
    const textoPesquisavel = normalizarTextoPesquisa(
      [
        comentario.assunto,
        comentario.titulo,
        getRotuloComentario(comentario),
      ]
        .filter(Boolean)
        .join(" "),
    );

    return textoPesquisavel.includes(termoNormalizado);
  });
}

export function LegisBotCommentsList({
  comentarios,
}: LegisBotCommentsListProps) {
  const [pesquisa, setPesquisa] = useState("");
  const comentariosFiltrados = useMemo(
    () => filtrarComentarios(comentarios, pesquisa),
    [comentarios, pesquisa],
  );

  const quantidade = comentarios.length;

  return (
    <>
      <p className="mt-4 text-sm font-bold text-blue-700" aria-live="polite">
        {quantidade} {quantidade === 1 ? "artigo já comentado" : "artigos já comentados"}
      </p>

      {quantidade ? (
        <>
          <div className="relative mt-5 w-full sm:max-w-xl">
            <svg
              aria-hidden="true"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400"
            >
              <circle cx="11" cy="11" r="7" />
              <path d="m20 20-4-4" />
            </svg>
            <input
              type="search"
              value={pesquisa}
              onChange={(event) => setPesquisa(event.target.value)}
              placeholder="Pesquisar assunto comentado..."
              aria-label="Pesquisar assunto comentado"
              className="h-12 w-full rounded-xl border border-slate-300 bg-white py-3 pl-12 pr-24 text-base text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
            />
            {pesquisa ? (
              <button
                type="button"
                onClick={() => setPesquisa("")}
                className="absolute right-2 top-1/2 min-h-9 -translate-y-1/2 rounded-lg px-3 text-sm font-bold text-blue-700 hover:bg-blue-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
                aria-label="Limpar pesquisa"
              >
                Limpar
              </button>
            ) : null}
          </div>

          {comentariosFiltrados.length ? (
            <ul className="mt-6 grid min-w-0 gap-3 sm:grid-cols-2" aria-live="polite">
              {comentariosFiltrados.map((comentario) => (
                <li key={`${comentario.slug}:${comentario.ordem}`} className="min-w-0">
                  <Link
                    href={`/legisbot/${encodeURIComponent(comentario.slug)}/${encodeURIComponent(comentario.ordem)}`}
                    className="group flex min-h-24 w-full min-w-0 flex-col items-start justify-between gap-3 rounded-xl border border-blue-100 bg-slate-50 p-4 transition hover:border-blue-300 hover:bg-blue-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2 sm:flex-row sm:items-center sm:gap-4"
                  >
                    <span className="min-w-0 text-base font-bold leading-6 text-[#062a5f]">
                      {getRotuloComentario(comentario)}
                    </span>
                    <span className="shrink-0 text-sm font-bold text-blue-700" aria-hidden="true">
                      Ver explicação →
                    </span>
                    <span className="sr-only">Abrir explicação do LegisBot</span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <div className="mt-6 rounded-xl border border-slate-200 bg-slate-50 p-5" aria-live="polite">
              <p className="font-bold text-slate-700">
                Nenhum artigo comentado encontrado para esta pesquisa.
              </p>
              <button
                type="button"
                onClick={() => setPesquisa("")}
                className="mt-3 rounded-lg text-sm font-bold text-blue-700 underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2"
              >
                Limpar pesquisa
              </button>
            </div>
          )}
        </>
      ) : (
        <p className="mt-5 max-w-3xl leading-7 text-slate-600">
          Os comentários desta legislação ainda estão sendo preparados.
        </p>
      )}
    </>
  );
}
