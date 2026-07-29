import {
  CommunityApiError,
  communityJsonError,
  requireRequestUser,
} from "@/lib/legisbot-community-server";
import { getSupabaseServerClient } from "@/lib/supabase-server";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: RouteContext) {
  try {
    const user = await requireRequestUser(request);
    const { id } = await params;
    const supabase = getSupabaseServerClient();
    const comment = await supabase
      .from("legisbot_comentarios_comunidade")
      .select("id,user_id,status")
      .eq("id", id)
      .maybeSingle();
    if (comment.error) throw comment.error;
    if (!comment.data || comment.data.status !== "publicado") throw new CommunityApiError(404, "Comentário não encontrado.");
    if (comment.data.user_id === user.id) throw new CommunityApiError(400, "Você não pode curtir o próprio comentário.");
    const result = await supabase.from("legisbot_comentarios_curtidas").insert({ comentario_id: id, user_id: user.id });
    if (result.error?.code === "23505") return Response.json({ success: true, liked: true });
    if (result.error) throw result.error;
    return Response.json({ success: true, liked: true });
  } catch (error) {
    return communityJsonError(error);
  }
}

export async function DELETE(request: Request, { params }: RouteContext) {
  try {
    const user = await requireRequestUser(request);
    const { id } = await params;
    const result = await getSupabaseServerClient()
      .from("legisbot_comentarios_curtidas")
      .delete()
      .eq("comentario_id", id)
      .eq("user_id", user.id);
    if (result.error) throw result.error;
    return Response.json({ success: true, liked: false });
  } catch (error) {
    return communityJsonError(error);
  }
}
