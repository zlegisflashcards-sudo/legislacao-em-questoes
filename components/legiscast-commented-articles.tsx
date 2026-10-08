"use client";

import { useMemo, useState } from "react";
import { LegisBotOverlay } from "@/components/legisbot-overlay";
import type { LegislacaoComentadaPublica } from "@/lib/legisbot/legislacao-comentada-publica";
import { getReferenciaDispositivo } from "@/lib/legisbot/referencia-dispositivo";
import { normalizarTextoPesquisa } from "@/components/legisbot-comments-list";

export const INITIAL_VISIBLE_ARTICLES = 18;

const HEAT = {
  muito_alta: "border-red-400 bg-red-100 hover:border-red-500 hover:bg-red-200",
  alta: "border-red-300 bg-red-50 hover:border-red-400 hover:bg-red-100",
  media: "border-rose-200 bg-rose-50 hover:border-rose-300 hover:bg-rose-100",
  baixa: "border-slate-200 bg-slate-50 hover:border-rose-200 hover:bg-rose-50",
  nao_mapeado: "border-blue-100 bg-white hover:border-blue-300 hover:bg-blue-50",
} as const;

const RECENT_HEAT = "border-sky-300 bg-sky-50 hover:border-sky-400 hover:bg-sky-100";

export function LegiscastCommentedArticles({ comments, recorteId }: { comments: LegislacaoComentadaPublica[]; recorteId: string | null }) {
  const [query, setQuery] = useState("");
  const [expanded, setExpanded] = useState(false);
  const [selectedComment, setSelectedComment] = useState<LegislacaoComentadaPublica | null>(null);
  const normalizedQuery = normalizarTextoPesquisa(query);
  const filtered = useMemo(() => comments.filter((comment) => normalizarTextoPesquisa([comment.ordem, comment.assunto, comment.titulo, comment.slug, getReferenciaDispositivo(comment)].filter(Boolean).join(" ")).includes(normalizedQuery)), [comments, normalizedQuery]);
  if (!comments.length) return null;
  const visible = normalizedQuery || expanded ? filtered : comments.slice(0, INITIAL_VISIBLE_ARTICLES);
  return <>
    <section className="mt-6 min-w-0 rounded-3xl border border-slate-200 bg-white p-4 shadow-sm sm:p-7" aria-labelledby="commented-articles-title" data-recorte-id={recorteId ?? undefined}>
      <h2 id="commented-articles-title" className="text-2xl font-black text-[#062a5f]">Legislação comentada</h2>
      <div className="relative mt-4 max-w-xl"><input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Pesquisar artigo..." aria-label="Pesquisar artigo comentado" className="min-h-12 w-full rounded-xl border border-slate-300 px-4 text-slate-900 outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-100" /></div>
      <div className="mt-4 flex flex-wrap items-center gap-3 text-xs font-semibold text-slate-600" aria-label="Legenda de prioridade editorial"><span className="inline-flex items-center gap-1.5"><i className="h-3 w-3 rounded-[3px] border border-blue-300 bg-blue-50" aria-hidden="true" />Recente</span><span className="inline-flex items-center gap-2"><i className="h-3 w-28 rounded-[3px] border border-red-200 bg-[linear-gradient(90deg,#fff_0%,#fef08a_35%,#fb923c_68%,#ef4444_100%)]" aria-hidden="true" /><span>Importância para revisão</span></span></div>
      {visible.length ? <ul className="mt-5 columns-1 gap-3 min-[420px]:columns-2 lg:columns-3" aria-live="polite">{visible.map((comment) => <li key={`${comment.slug}:${comment.ordem}`} className="mb-3 break-inside-avoid"><button type="button" onClick={() => setSelectedComment(comment)} className={`flex min-h-11 w-full items-center rounded-xl border px-4 py-2 text-left font-bold text-[#062a5f] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 ${comment.artigo_recente ? RECENT_HEAT : HEAT[comment.incidencia]}`} title={comment.artigo_recente ? "Artigo recente" : `Incidência: ${comment.incidencia.replaceAll("_", " ")}`}>{getReferenciaDispositivo(comment)}</button></li>)}</ul> : <p className="mt-5 rounded-xl bg-slate-50 p-4 font-bold text-slate-700">Nenhum artigo confiável encontrado.</p>}
      {!normalizedQuery && comments.length > INITIAL_VISIBLE_ARTICLES ? <button type="button" className="mt-3 min-h-11 rounded-xl border border-blue-200 px-5 py-2 font-black text-blue-700 hover:bg-blue-50" onClick={() => setExpanded((value) => !value)} aria-expanded={expanded}>{expanded ? "Ver menos" : "Ver mais"}</button> : null}
    </section>
    {selectedComment ? <LegisBotOverlay slug={selectedComment.slug} question={selectedComment} initialTab="legisbot" publicComment={selectedComment.comentario} recorteId={recorteId} onClose={() => setSelectedComment(null)} /> : null}
  </>;
}
