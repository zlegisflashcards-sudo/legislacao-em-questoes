import { obterAdministrador } from "@/lib/admin-auth";
import { getSupabaseServerClient } from "@/lib/supabase-server";
import AdminEditCommentInlineShortcut from "@/components/admin/admin-edit-comment-inline-shortcut";
import type { LegisBotComentario } from "@/lib/legisbot-comentario";

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
      .select("*")
      .eq("slug", slugNormalizado)
      .eq("ordem", ordemNormalizada)
      .maybeSingle();

    if (error || !data?.id) return null;

    return <AdminEditCommentInlineShortcut record={data as LegisBotComentario} />;
  } catch {
    return null;
  }
}
