import Link from "next/link";
import { obterAdministrador } from "@/lib/admin-auth";
import { getSupabaseServerClient } from "@/lib/supabase-server";

const SLUG_VALIDO = /^[A-Z0-9_-]{1,50}$/;
const ORDEM_VALIDA = /^[A-Za-z0-9._-]{1,20}$/;

export default async function AdminEditCommentShortcut({
  slug,
  ordem,
}: {
  slug: string;
  ordem: string;
}) {
  const slugNormalizado = slug.trim().toUpperCase();
  const ordemNormalizada = ordem.trim();

  if (!SLUG_VALIDO.test(slugNormalizado) || !ORDEM_VALIDA.test(ordemNormalizada)) {
    return null;
  }

  try {
    const administrador = await obterAdministrador();
    if (!administrador) return null;

    const { data, error } = await getSupabaseServerClient()
      .from("legisbot_comentarios")
      .select("id")
      .eq("slug", slugNormalizado)
      .eq("ordem", ordemNormalizada)
      .maybeSingle();

    if (error || !data?.id) return null;

    return (
      <Link
        href={`/admin/legisbot/${data.id}`}
        className="admin-edit-comment-shortcut"
        aria-label="Editar este comentário no painel administrativo"
        title="Editar comentário"
      >
        <span aria-hidden="true">🔧</span>
        <span className="admin-edit-comment-label">Editar comentário</span>
      </Link>
    );
  } catch {
    return null;
  }
}
