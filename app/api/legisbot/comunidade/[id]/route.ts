import { validateCommunityContent } from "@/lib/legisbot-community";
import {
  CommunityApiError,
  communityJsonError,
  requireRequestUser,
} from "@/lib/legisbot-community-server";
import { getSupabaseServerClient } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";
type RouteContext = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, { params }: RouteContext) {
  try {
    const user = await requireRequestUser(request);
    const { id } = await params;
    const body = await request.json().catch(() => null) as Record<string, unknown> | null;
    if (!/^[0-9a-f-]{36}$/i.test(id) || !body) throw new CommunityApiError(400, "Comentário inválido.");
    const validation = validateCommunityContent(String(body.content ?? ""));
    if (!validation.ok) throw new CommunityApiError(400, validation.message);
    const supabase = getSupabaseServerClient();
    const existing = await supabase
      .from("legisbot_comentarios_comunidade")
      .select("id,user_id,status")
      .eq("id", id)
      .maybeSingle();
    if (existing.error) throw existing.error;
    if (!existing.data || existing.data.status !== "publicado") throw new CommunityApiError(404, "Comentário não encontrado.");
    if (existing.data.user_id !== user.id) throw new CommunityApiError(403, "Você não pode editar este comentário.");
    const result = await supabase
      .from("legisbot_comentarios_comunidade")
      .update({ conteudo: validation.content })
      .eq("id", id)
      .eq("user_id", user.id);
    if (result.error) throw result.error;
    return Response.json({ success: true, message: "Comentário atualizado." });
  } catch (error) {
    return communityJsonError(error);
  }
}

export async function DELETE(request: Request, { params }: RouteContext) {
  try {
    const user = await requireRequestUser(request);
    const { id } = await params;
    if (!/^[0-9a-f-]{36}$/i.test(id)) throw new CommunityApiError(400, "Comentário inválido.");
    const supabase = getSupabaseServerClient();
    const existing = await supabase
      .from("legisbot_comentarios_comunidade")
      .select("id,user_id,status")
      .eq("id", id)
      .maybeSingle();
    if (existing.error) throw existing.error;
    if (!existing.data || existing.data.status === "removido") throw new CommunityApiError(404, "Comentário não encontrado.");
    if (existing.data.user_id !== user.id) throw new CommunityApiError(403, "Você não pode excluir este comentário.");
    const result = await supabase
      .from("legisbot_comentarios_comunidade")
      .update({ conteudo: null, status: "removido", deleted_at: new Date().toISOString() })
      .eq("id", id)
      .eq("user_id", user.id);
    if (result.error) throw result.error;
    return Response.json({ success: true, message: "Comentário removido." });
  } catch (error) {
    return communityJsonError(error);
  }
}
