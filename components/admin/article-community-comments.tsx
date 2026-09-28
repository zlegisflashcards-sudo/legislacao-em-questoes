import Link from "next/link";
import { moderateCommunityComment } from "@/app/admin/community-actions";

type Comment = { id: string; author: string; conteudo: string | null; trecho_citado: string | null; status: string; created_at: string; reports: number; slug: string; ordem: string; parent_id?: string | null; publicado_como_equipe?: boolean | null };
const fmt = (value: string) => new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date(value));

export function ArticleCommunityComments({ comments, highlightedId }: { comments: Comment[]; highlightedId?: string }) {
  if (!comments.length) return <div className="admin-empty"><h2>Nenhum comentário neste artigo</h2><p>As novas contribuições dos alunos aparecerão aqui.</p></div>;
  return <div className="article-comment-list">{comments.map((item) => <article id={`comentario-${item.id}`} className={`article-comment ${highlightedId === item.id ? "is-highlighted" : ""}`} key={item.id}>
    <header><div><strong>{item.publicado_como_equipe ? "Legis Flashcards ✓" : item.author}</strong>{item.publicado_como_equipe ? <span>Publicado por {item.author}</span> : null}<span>{fmt(item.created_at)}{item.parent_id ? " · resposta a um comentário" : ""}</span></div><div><span className={`admin-status status-${item.status}`}>{item.status}</span>{item.reports ? <span className="article-report">{item.reports} denúncia(s)</span> : null}</div></header>
    {item.trecho_citado ? <mark>{item.trecho_citado}</mark> : null}<p>{item.conteudo ?? "Comentário removido."}</p>
    <footer><Link href={`/legisbot/${encodeURIComponent(item.slug.toLowerCase())}/${encodeURIComponent(item.ordem)}#community-title`} target="_blank">Abrir página pública</Link>{item.status !== "removido" ? <div className="article-comment-actions">{(["publicado", "em_analise", "oculto", "removido"] as const).map((status) => <form action={moderateCommunityComment} key={status}><input type="hidden" name="id" value={item.id}/><input type="hidden" name="status" value={status}/><button className="admin-link-button">{status === "publicado" ? "Restaurar" : status === "em_analise" ? "Em análise" : status === "oculto" ? "Ocultar" : "Remover"}</button></form>)}</div> : null}</footer>
  </article>)}</div>;
}
