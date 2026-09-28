import Link from "next/link";
import { notFound } from "next/navigation";
import { ArticleCommunityComments } from "@/components/admin/article-community-comments";
import LegisBotEditor from "@/components/admin/legisbot-editor";
import { getArticleCommunityComments, getArticleContext } from "@/lib/admin-article-center-server";
import { exigirAdministrador } from "@/lib/admin-auth";

export const dynamic = "force-dynamic";
const one = (value: string | string[] | undefined) => Array.isArray(value) ? value[0] ?? "" : value ?? "";

export default async function AdminArticleDetailPage({ params, searchParams }: { params: Promise<{ slug: string; ordem: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const [{ slug, ordem }, query] = await Promise.all([params, searchParams]);
  await exigirAdministrador();
  const article = await getArticleContext(slug, ordem);
  if (!article) notFound();
  const tab = one(query.aba) === "comentarios" ? "comentarios" : "legisbot";
  const comments = tab === "comentarios" ? await getArticleCommunityComments(article.slug, article.ordem, { q: one(query.q), author: one(query.usuario), status: one(query.status), reported: one(query.denunciados) === "1" }) : [];
  const publicUrl = `/legisbot/${encodeURIComponent(article.slug.toLowerCase())}/${encodeURIComponent(article.ordem)}`;
  const lawUrl = article.lawTitle ? `/admin/leis/${encodeURIComponent(article.slug.toLowerCase())}` : null;
  return <main className="admin-shell article-center-shell"><nav className="law-center-breadcrumb"><Link href="/admin">Administração</Link><span>/</span><Link href="/admin/artigos">Central do Artigo</Link><span>/</span><span>Artigo</span></nav><header className="article-context-header"><div><div className="admin-eyebrow">Central do Artigo</div><h1>{article.lawTitle ?? article.titulo} — {article.assunto || `Art. ${article.ordem}`}</h1><p>{article.lawCode ? `${article.lawCode} · ` : ""}código interno: {article.slug} · ordem: {article.ordem}</p></div><div className="article-header-actions"><Link className="admin-button secondary" href={`/leis/${encodeURIComponent(article.slug.toLowerCase())}`} target="_blank">Abrir na legislação</Link><Link className="admin-button secondary" href={publicUrl} target="_blank">Abrir página pública</Link>{lawUrl ? <Link className="admin-button secondary" href={lawUrl}>Abrir na Central da Lei</Link> : null}</div></header>
    <nav className="article-tabs" aria-label="Áreas da Central do Artigo"><Link className={tab === "legisbot" ? "active" : ""} href={`/admin/artigos/${encodeURIComponent(article.slug.toLowerCase())}/${encodeURIComponent(article.ordem)}`}>LegisBot</Link><Link className={tab === "comentarios" ? "active" : ""} href={`/admin/artigos/${encodeURIComponent(article.slug.toLowerCase())}/${encodeURIComponent(article.ordem)}?aba=comentarios`}>Comentários <span>{article.commentsCount}</span></Link></nav>
    {tab === "legisbot" ? <section className="article-legisbot"><header><div><h2>Conteúdo do LegisBot</h2><p>Editor, prévia, publicação e exclusão reutilizam o fluxo administrativo original.</p></div><Link className="admin-button secondary" href={publicUrl} target="_blank">Visualizar página pública</Link></header><LegisBotEditor record={article} returnHref={`/admin/artigos/${encodeURIComponent(article.slug.toLowerCase())}/${encodeURIComponent(article.ordem)}`} /></section> : <section><header className="article-comments-heading"><div><h2>Comentários da comunidade</h2><p>Moderação limitada a {article.slug} + ordem {article.ordem}.</p></div><Link className="admin-button secondary" href={publicUrl} target="_blank">Abrir página pública</Link></header><form className="article-comment-filters"><input name="aba" type="hidden" value="comentarios"/><label>Conteúdo<input name="q" defaultValue={one(query.q)} placeholder="Comentário ou trecho"/></label><label>Usuário<input name="usuario" defaultValue={one(query.usuario)} placeholder="Nome público"/></label><label>Status<select name="status" defaultValue={one(query.status)}><option value="">Todos</option><option value="publicado">Publicado</option><option value="em_analise">Em análise</option><option value="oculto">Oculto</option><option value="removido">Removido</option></select></label><label>Denúncias<select name="denunciados" defaultValue={one(query.denunciados)}><option value="">Todas</option><option value="1">Pendentes</option></select></label><button className="admin-button primary">Filtrar</button><Link className="admin-button secondary" href={`/admin/artigos/${encodeURIComponent(article.slug.toLowerCase())}/${encodeURIComponent(article.ordem)}?aba=comentarios`}>Limpar</Link></form><ArticleCommunityComments comments={comments} highlightedId={one(query.comentario)} /></section>}
  </main>;
}
