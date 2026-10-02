import Link from "next/link";

export default function AdminEditCommentInlineShortcut({ slug, ordem }: { slug: string; ordem: string }) {
  return <Link
      className="admin-edit-comment-shortcut"
      aria-label="Editar este comentário na Central do Artigo"
      title="Editar na Central do Artigo"
      href={`/admin/artigos/${encodeURIComponent(slug.toLowerCase())}/${encodeURIComponent(ordem)}?aba=legisbot`}
    >
      <span aria-hidden="true">🔧</span>
      <span className="admin-edit-comment-label">Editar comentário</span>
    </Link>;
}
