"use client";

import { useMemo, useState } from "react";
import { LegisBotOverlay } from "@/components/legisbot-overlay";
import type { ComentarioPublicoLegisBot } from "@/lib/legisbot/comentarios-publicos";
import { getRotuloComentario, normalizarTextoPesquisa } from "@/components/legisbot-comments-list";

export const INITIAL_VISIBLE_ARTICLES = 18;

export function LegiscastCommentedArticles({ comments, recorteId }: { comments: ComentarioPublicoLegisBot[]; recorteId: string | null }) {
  const [query, setQuery] = useState("");
  const [expanded, setExpanded] = useState(false);
  const [selectedComment, setSelectedComment] = useState<ComentarioPublicoLegisBot | null>(null);
  const normalizedQuery = normalizarTextoPesquisa(query);
  const filtered = useMemo(() => comments.filter((comment) => normalizarTextoPesquisa([comment.ordem, comment.assunto, comment.titulo, getRotuloComentario(comment)].filter(Boolean).join(" ")).includes(normalizedQuery)), [comments, normalizedQuery]);
  if (!comments.length) return null;
  const visible = normalizedQuery || expanded ? filtered : comments.slice(0, INITIAL_VISIBLE_ARTICLES);
  return <>
    <section className="mt-6 min-w-0 rounded-3xl border border-slate-200 bg-white p-4 shadow-sm sm:p-7" aria-labelledby="commented-articles-title" data-recorte-id={recorteId ?? undefined}>
      <h2 id="commented-articles-title" className="text-2xl font-black text-[#062a5f]">Artigos comentados</h2>
      <div className="relative mt-4 max-w-xl"><input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Pesquisar artigo..." aria-label="Pesquisar artigo comentado" className="min-h-12 w-full rounded-xl border border-slate-300 px-4 text-slate-900 outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-100" /></div>
      {visible.length ? <ul className="mt-5 columns-1 gap-3 min-[420px]:columns-2 lg:columns-3" aria-live="polite">{visible.map((comment) => <li key={`${comment.slug}:${comment.ordem}`} className="mb-3 break-inside-avoid"><button type="button" onClick={() => setSelectedComment(comment)} className="flex min-h-11 w-full items-center rounded-xl border border-blue-100 bg-slate-50 px-4 py-2 text-left font-bold text-[#062a5f] hover:border-blue-300 hover:bg-blue-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600">{getRotuloComentario(comment)}</button></li>)}</ul> : <p className="mt-5 rounded-xl bg-slate-50 p-4 font-bold text-slate-700">Nenhum artigo comentado encontrado.</p>}
      {!normalizedQuery && comments.length > INITIAL_VISIBLE_ARTICLES ? <button type="button" className="mt-3 min-h-11 rounded-xl border border-blue-200 px-5 py-2 font-black text-blue-700 hover:bg-blue-50" onClick={() => setExpanded((value) => !value)} aria-expanded={expanded}>{expanded ? "Ver menos" : "Ver mais"}</button> : null}
    </section>
    {selectedComment ? <LegisBotOverlay slug={selectedComment.slug} question={{ ordem: selectedComment.ordem, titulo: selectedComment.titulo, assunto: selectedComment.assunto }} initialTab="legisbot" onClose={() => setSelectedComment(null)} /> : null}
  </>;
}
