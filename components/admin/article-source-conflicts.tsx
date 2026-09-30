"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type ConflictList = Awaited<ReturnType<typeof import("@/lib/admin-article-conflicts-server").listArticleSourceConflicts>>;
type Filters = { law?: string; ordem?: string; titulo?: string; assunto?: string; status?: string; q?: string };

const SESSION_KEY = "legisbot-conflicts-resolved-session";

export function ArticleSourceConflicts({ data, filters }: { data: ConflictList; filters: Filters }) {
  const [resolved, setResolved] = useState(0);
  useEffect(() => { setResolved(Number(window.sessionStorage.getItem(SESSION_KEY) ?? 0) || 0); }, []);
  const hrefForPage = (page: number) => {
    const params = new URLSearchParams({ aba: "conflitos" });
    for (const [key, value] of Object.entries(filters)) if (value) params.set(key, value);
    params.set("pagina", String(page));
    return `/admin/artigos?${params}`;
  };
  return <section className="grid gap-5">
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <Indicator label="Conflitos pendentes" value={data.indicators.pending} />
      <Indicator label="Resolvidos nesta sessão" value={resolved} />
      <Indicator label="Leis afetadas" value={data.indicators.laws} />
      <Indicator label="Flashcards envolvidos" value={data.indicators.flashcards} />
    </div>
    <form className="commercial-card grid gap-3 lg:grid-cols-3 xl:grid-cols-4">
      <input type="hidden" name="aba" value="conflitos" />
      <label className="grid gap-1 font-bold">Lei ou slug<input name="lei" defaultValue={filters.law} placeholder="Lei, código ou slug" /></label>
      <label className="grid gap-1 font-bold">Ordem<input name="ordem" defaultValue={filters.ordem} placeholder="Ex.: 0001.0.00.00" /></label>
      <label className="grid gap-1 font-bold">Título<input name="titulo" defaultValue={filters.titulo} /></label>
      <label className="grid gap-1 font-bold">Assunto<input name="assunto" defaultValue={filters.assunto} /></label>
      <label className="grid gap-1 font-bold">Status<select name="status" defaultValue={filters.status}><option value="">Todos</option><option value="com_comentario">Com comentário</option><option value="sem_comentario">Sem comentário</option><option value="precisa_revisao">Precisa de revisão</option><option value="pendente">Comentário pendente</option><option value="processando">Comentário processando</option><option value="concluido">Comentário concluído</option><option value="erro">Comentário com erro</option></select></label>
      <label className="grid gap-1 font-bold lg:col-span-2">Busca textual<input name="q" defaultValue={filters.q} placeholder="Lei, dispositivo ou conteúdo legal" /></label>
      <div className="flex items-end gap-2"><button className="admin-button primary">Filtrar</button><Link className="admin-button secondary" href="/admin/artigos?aba=conflitos">Limpar</Link></div>
    </form>
    <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="article-section-title">Conflitos reais</h2><span className="text-sm text-slate-600">{data.total} resultado(s) · página {data.page} de {data.pages}</span></div>
    {data.items.length ? <div className="grid gap-3">{data.items.map((item) => <article className="commercial-card grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center" key={`${item.slug}:${item.ordem}`}>
      <div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><strong className="text-lg">{item.lawTitle}</strong>{item.lawCode ? <span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-bold">{item.lawCode}</span> : null}</div><p className="mt-1 font-bold text-slate-700">{item.assunto || item.titulo || `Ordem ${item.ordem}`}</p><p className="mt-2 text-sm text-slate-600"><code>{item.slug}</code> · ordem <code>{item.ordem}</code> · {item.flashcards} flashcards · {item.versions} versões legais</p><p className="mt-2 text-sm">{item.comment ? <>LegisBot: <strong>{item.comment.status}</strong>{item.comment.precisa_revisao ? " · Precisa de revisão" : ""}</> : "Sem comentário do LegisBot"}</p></div>
      <Link className="admin-button primary" href={`/admin/artigos/conflitos/${encodeURIComponent(item.slug.toLowerCase())}/${encodeURIComponent(item.ordem)}`}>Analisar conflito</Link>
    </article>)}</div> : <div className="admin-empty"><h2>Nenhum conflito encontrado</h2><p>Duplicidades equivalentes são ignoradas automaticamente pelo mesmo normalizador do LegisBot.</p></div>}
    {data.pages > 1 ? <nav className="flex items-center justify-center gap-3" aria-label="Paginação de conflitos"><Link aria-disabled={data.page === 1} className={`admin-button secondary ${data.page === 1 ? "pointer-events-none opacity-50" : ""}`} href={hrefForPage(Math.max(1, data.page - 1))}>← Anterior</Link><span>{data.page} / {data.pages}</span><Link aria-disabled={data.page === data.pages} className={`admin-button secondary ${data.page === data.pages ? "pointer-events-none opacity-50" : ""}`} href={hrefForPage(Math.min(data.pages, data.page + 1))}>Próxima →</Link></nav> : null}
  </section>;
}

function Indicator({ label, value }: { label: string; value: number }) {
  return <article className="commercial-card"><span className="text-sm font-bold text-slate-500">{label}</span><strong className="mt-2 block text-3xl text-slate-900">{value}</strong></article>;
}

export const articleConflictSessionKey = SESSION_KEY;
