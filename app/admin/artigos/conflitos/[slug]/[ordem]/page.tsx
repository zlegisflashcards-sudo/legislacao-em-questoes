import Link from "next/link";
import { notFound } from "next/navigation";
import { ArticleSourceConflictDetail } from "@/components/admin/article-source-conflict-detail";
import { exigirAdministrador } from "@/lib/admin-auth";
import { getArticleSourceConflict } from "@/lib/admin-article-conflicts-server";

export const dynamic = "force-dynamic";

export default async function AdminArticleConflictPage({ params }: { params: Promise<{ slug: string; ordem: string }> }) {
  const { slug, ordem } = await params;
  await exigirAdministrador();
  const conflict = await getArticleSourceConflict(slug, ordem);
  if (!conflict) notFound();
  return <main className="admin-shell article-center-shell">
    <nav className="law-center-breadcrumb"><Link href="/admin">Administração</Link><span>/</span><Link href="/admin/artigos?aba=conflitos">Conflitos</Link><span>/</span><span>{conflict.slug} + {conflict.ordem}</span></nav>
    <header className="article-context-header"><div><div className="admin-eyebrow">Central do Artigo · Conflitos</div><h1>{conflict.lawTitle}</h1><p>{conflict.lawCode ? `${conflict.lawCode} · ` : ""}código interno: {conflict.slug} · ordem: {conflict.ordem}</p></div><div className="article-header-actions"><Link className="admin-button secondary" href={`/admin/artigos/${encodeURIComponent(conflict.slug.toLowerCase())}/${encodeURIComponent(conflict.ordem)}`}>Abrir artigo</Link><Link className="admin-button secondary" href="/admin/artigos?aba=conflitos">← Lista de conflitos</Link></div></header>
    {conflict.comment ? <p className={`admin-alert ${conflict.comment.precisa_revisao ? "error" : "success"}`}>Comentário do LegisBot: {conflict.comment.status}{conflict.comment.precisa_revisao ? " · Precisa de revisão" : ""}. O comentário será preservado durante a correção.</p> : <p className="admin-alert">Ainda não existe comentário do LegisBot para estes identificadores.</p>}
    <ArticleSourceConflictDetail conflict={conflict} />
  </main>;
}
