import Link from "next/link";
import { ArticleSourceConflicts } from "@/components/admin/article-source-conflicts";
import { listArticleSourceConflicts } from "@/lib/admin-article-conflicts-server";
import { getLatestArticleInteractions, searchArticleContexts } from "@/lib/admin-article-center-server";
import { exigirAdministrador } from "@/lib/admin-auth";

export const dynamic = "force-dynamic";
const one = (value: string | string[] | undefined) => Array.isArray(value) ? value[0] ?? "" : value ?? "";
const fmt = (value: string) => new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date(value));

export default async function AdminArticlesPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const tab = one(params.aba) === "conflitos" ? "conflitos" : one(params.aba) === "comentarios" ? "comentarios" : "legisbot";
  const query = one(params.q);
  await exigirAdministrador();
  const conflictFilters = { law: one(params.lei), ordem: one(params.ordem), titulo: one(params.titulo), assunto: one(params.assunto), status: one(params.status), q: query };
  const conflicts = tab === "conflitos" ? await listArticleSourceConflicts({ ...conflictFilters, page: Number(one(params.pagina)) || 1 }) : null;
  const [results, allInteractions] = tab !== "conflitos"
    ? await Promise.all([query.trim() ? searchArticleContexts(query) : Promise.resolve([]), query.trim() ? Promise.resolve([]) : getLatestArticleInteractions()])
    : [[], []];
  const interactions = allInteractions.filter((item) => tab === "comentarios" ? item.kind === "comentario" : item.kind === "legisbot");

  return <main className="admin-shell article-center-shell">
    <Link className="admin-central-link" href="/admin">← Central Administrativa</Link>
    <header className="admin-header"><div><div className="admin-eyebrow">Central do Artigo</div><h1>Artigos e interações</h1><p>Consulte o conteúdo editorial do LegisBot, a comunidade e conflitos nos flashcards.</p></div><Link className="admin-button primary" href="/admin/legisbot/novo">+ Criar conteúdo do LegisBot</Link></header>
    <nav className="article-tabs" aria-label="Áreas da Central do Artigo"><Link className={tab === "legisbot" ? "active" : ""} href="/admin/artigos?aba=legisbot">LegisBot</Link><Link className={tab === "comentarios" ? "active" : ""} href="/admin/artigos?aba=comentarios">Comentários</Link><Link className={tab === "conflitos" ? "active" : ""} href="/admin/artigos?aba=conflitos">Conflitos{conflicts ? <span>{conflicts.indicators.pending}</span> : null}</Link></nav>
    {tab === "conflitos" && conflicts ? <ArticleSourceConflicts data={conflicts} filters={conflictFilters} /> : <>
      <form className="article-search"><input type="hidden" name="aba" value={tab}/><label htmlFor="article-search">Buscar artigo</label><div><input id="article-search" name="q" defaultValue={query} placeholder="Buscar por lei, artigo, ordem ou código..." autoComplete="off"/><button className="admin-button primary">Buscar</button></div></form>
      {query.trim() ? <section aria-live="polite"><h2 className="article-section-title">Resultados para “{query}”</h2>{results.length ? <div className="article-result-list">{results.map((item) => <article className="article-result" key={item.id}><div><strong>{item.lawTitle ?? item.titulo}</strong><p>{item.assunto || `Art. ${item.ordem}`} · ordem {item.ordem}</p><small>{item.lawCode ? `${item.lawCode} · ` : ""}{item.slug} · {item.commentsCount} comentário(s) · <span className={`admin-status status-${item.status}`}>{item.status}</span></small></div><Link className="admin-button secondary" href={`/admin/artigos/${encodeURIComponent(item.slug.toLowerCase())}/${encodeURIComponent(item.ordem)}${tab === "comentarios" ? "?aba=comentarios" : ""}`}>Abrir</Link></article>)}</div> : <div className="admin-empty"><h2>Nenhum artigo encontrado</h2><p>Pesquise por lei, código, slug, artigo ou ordem.</p></div>}</section> : <section><h2 className="article-section-title">{tab === "comentarios" ? "Últimos comentários dos alunos" : "Últimas solicitações do LegisBot"}</h2>{tab === "legisbot" ? <p className="article-interaction-note">Solicitações do LegisBot são anônimas: o modelo atual não registra qual aluno as iniciou.</p> : null}{interactions.length ? <div className="article-interaction-list">{interactions.map((item) => <Link className="article-interaction" href={`/admin/artigos/${encodeURIComponent(item.slug.toLowerCase())}/${encodeURIComponent(item.ordem)}${item.kind === "comentario" ? `?aba=comentarios&comentario=${encodeURIComponent(item.id)}` : "?aba=legisbot"}`} key={`${item.kind}-${item.id}`}><span className="article-kind">{item.kind === "comentario" ? "Comentário" : "LegisBot"}</span><div><strong>{item.author ?? "Solicitação anônima"}</strong><p>{item.slug} · ordem {item.ordem} · {item.summary}</p></div><small>{item.status} · {fmt(item.createdAt)}</small></Link>)}</div> : <div className="admin-empty"><h2>Ainda não há interações</h2><p>As interações desta área aparecerão aqui.</p></div>}</section>}
    </>}
  </main>;
}
