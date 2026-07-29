import {
  CommunityApiError,
  communityJsonError,
  requireRequestUser,
} from "@/lib/legisbot-community-server";
import { getSupabaseServerClient } from "@/lib/supabase-server";

const MOTIVOS = new Set(["incorreto", "ofensivo", "spam", "fora_do_tema", "outro"]);
type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: RouteContext) {
  try {
    const user = await requireRequestUser(request);
    const { id } = await params;
    const body = await request.json().catch(() => null) as { motivo?: unknown } | null;
    const motivo = String(body?.motivo ?? "");
    if (!MOTIVOS.has(motivo)) throw new CommunityApiError(400, "Selecione um motivo válido.");
    const supabase = getSupabaseServerClient();
    const comment = await supabase
      .from("legisbot_comentarios_comunidade")
      .select("id,user_id,status")
      .eq("id", id)
      .maybeSingle();
    if (comment.error) throw comment.error;
    if (!comment.data || comment.data.status !== "publicado") throw new CommunityApiError(404, "Comentário não encontrado.");
    if (comment.data.user_id === user.id) throw new CommunityApiError(400, "Você não pode denunciar o próprio comentário.");
    const result = await supabase.from("legisbot_comentarios_denuncias").insert({
      comentario_id: id,
      user_id: user.id,
      motivo,
      status: "pendente",
    });
    if (result.error?.code === "23505") {
      return Response.json({ success: true, message: "Esta denúncia já foi registrada." });
    }
    if (result.error) throw result.error;
    return Response.json({ success: true, message: "Denúncia enviada para a equipe." }, { status: 201 });
  } catch (error) {
    return communityJsonError(error);
  }
}
