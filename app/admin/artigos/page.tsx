import Link from "next/link";
import { ArticleSourceConflicts } from "@/components/admin/article-source-conflicts";
import { listArticleSourceConflicts } from "@/lib/admin-article-conflicts-server";
import { listArticleContextLaws, listArticleContexts, searchArticleContexts } from "@/lib/admin-article-center-server";
import { exigirAdministrador } from "@/lib/admin-auth";

export const dynamic = "force-dynamic";
const one = (value: string | string[] | undefined) => Array.isArray(value) ? value[0] ?? "" : value ?? "";

export default async function AdminArticlesPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const tab = one(params.aba) === "conflitos" ? "conflitos" : one(params.aba) === "comentarios" ? "comentarios" : "legisbot";
  const query = one(params.q);
  const lawFilter = one(params.lei).toLowerCase();
  const orderDirection = one(params.ordem_sort) === "desc" ? "desc" : "asc";
  await exigirAdministrador();
  const conflictFilters = { law: one(params.lei), ordem: one(params.ordem), titulo: one(params.titulo), assunto: one(params.assunto), status: one(params.status), q: query };
  const conflicts = tab === "conflitos" ? await listArticleSourceConflicts({ ...conflictFilters, page: Number(one(params.pagina)) || 1 }) : null;
  const [results, recentArticles, laws] = tab !== "conflitos"
    ? await Promise.all([query.trim() ? searchArticleContexts(query, lawFilter) : Promise.resolve([]), query.trim() ? Promise.resolve([]) : listArticleContexts(lawFilter), listArticleContextLaws()])
    : [[], [], await listArticleContextLaws()];
  const tabHref = (nextTab: string) => `/admin/artigos?aba=${nextTab}${lawFilter ? `&lei=${encodeURIComponent(lawFilter)}` : ""}${query ? `&q=${encodeURIComponent(query)}` : ""}`;
  const visibleArticles = (query.trim() ? results : recentArticles).toSorted((left, right) => orderDirection === "asc" ? left.ordem.localeCompare(right.ordem) : right.ordem.localeCompare(left.ordem));

  return <main className="admin-shell article-center-shell">
    <Link className="admin-central-link" href="/admin">← Central Administrativa</Link>
    <header className="admin-header"><div><div className="admin-eyebrow">Central do Artigo</div><h1>Artigos e dispositivos</h1><p>Os dispositivos derivados das questões são a base; LegisBot, comunidade e conflitos são camadas agregadas.</p></div><Link className="admin-button primary" href="/admin/legisbot/novo">+ Criar conteúdo do LegisBot</Link></header>
    <nav className="article-tabs" aria-label="Áreas da Central do Artigo"><Link className={tab === "legisbot" ? "active" : ""} href={tabHref("legisbot")}>LegisBot</Link><Link className={tab === "comentarios" ? "active" : ""} href={tabHref("comentarios")}>Comentários</Link><Link className={tab === "conflitos" ? "active" : ""} href={tabHref("conflitos")}>Conflitos{conflicts ? <span>{conflicts.indicators.pending}</span> : null}</Link></nav>
    {tab === "conflitos" && conflicts ? <ArticleSourceConflicts data={conflicts} filters={conflictFilters} /> : <>
      <form className="article-search"><input type="hidden" name="aba" value={tab}/><label>Lei<select name="lei" defaultValue={lawFilter}><option value="">Todas as leis</option>{laws.map((law) => <option key={law.slug} value={law.slug}>{law.code ? `${law.code} — ` : ""}{law.title}</option>)}</select></label><label>Ordem<select name="ordem_sort" defaultValue={orderDirection}><option value="asc">Crescente</option><option value="desc">Decrescente</option></select></label><label htmlFor="article-search">Buscar artigo</label><div><input id="article-search" name="q" defaultValue={query} placeholder="Buscar artigo por lei, código, artigo, ordem, título ou assunto..." autoComplete="off"/><button className="admin-button primary">Buscar</button><Link className="admin-button secondary" href={`/admin/artigos?aba=${tab}${query ? `&q=${encodeURIComponent(query)}` : ""}`}>Limpar lei</Link></div></form>
      {visibleArticles.length ? <section aria-live="polite"><h2 className="article-section-title">{query.trim() ? `Resultados para “${query}”` : lawFilter ? "Dispositivos da lei selecionada" : "Dispositivos das questões"}</h2><div className="article-result-list">{visibleArticles.map((item) => <article className="article-result" key={`${item.slug}:${item.ordem}`}><div><strong>{item.lawTitle ?? item.titulo}</strong><p>{item.assunto || `Art. ${item.ordem}`} · ordem {item.ordem}</p><small>{item.lawCode ? `${item.lawCode} · ` : ""}{item.slug} · LegisBot: {item.legisbot ? item.legisbot.status : "—"} · {item.commentsCount} comentário(s) · {item.questionsCount} questão(ões) · {item.conflictsCount} conflito(s) · {item.pendingCount} pendência(s)</small></div><Link className="admin-button secondary" href={`/admin/artigos/${encodeURIComponent(item.slug.toLowerCase())}/${encodeURIComponent(item.ordem)}?lei=${encodeURIComponent(lawFilter || item.slug.toLowerCase())}&ordem_sort=${orderDirection}${query ? `&q=${encodeURIComponent(query)}` : ""}`}>Abrir</Link></article>)}</div></section> : <div className="admin-empty"><h2>Nenhum dispositivo encontrado</h2><p>Não há questões ativas que formem contextos de artigo.</p></div>}
    </>}
  </main>;
}
