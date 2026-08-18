import { CommunityApiError, requireRequestUser } from "@/lib/legisbot-community-server";
import { highlightJsonError } from "@/lib/legisbot-highlights-server";
import { isHighlightColor } from "@/lib/legisbot-highlights";
import { createSupabaseUserClient } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

function accessToken(request: Request) {
  const header = request.headers.get("authorization") ?? "";
  return header.startsWith("Bearer ") ? header.slice(7).trim() : "";
}

function validId(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    if (!validId(id)) throw new CommunityApiError(400, "Destaque inválido.");
    await requireRequestUser(request);
    const body = await request.json().catch(() => null) as Record<string, unknown> | null;
    if (!body || !isHighlightColor(body.color)) throw new CommunityApiError(400, "Escolha uma cor válida.");

    const { data, error } = await createSupabaseUserClient(accessToken(request))
      .from("legisbot_destaques_usuario")
      .update({ cor: body.color })
      .eq("id", id)
      .select("id")
      .maybeSingle();
    if (error) throw error;
    if (!data) throw new CommunityApiError(404, "Destaque não encontrado.");
    return Response.json({ success: true });
  } catch (error) {
    return highlightJsonError(error);
  }
}

export async function DELETE(request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    if (!validId(id)) throw new CommunityApiError(400, "Destaque inválido.");
    await requireRequestUser(request);
    const { data, error } = await createSupabaseUserClient(accessToken(request))
      .from("legisbot_destaques_usuario")
      .delete()
      .eq("id", id)
      .select("id")
      .maybeSingle();
    if (error) throw error;
    if (!data) throw new CommunityApiError(404, "Destaque não encontrado.");
    return Response.json({ success: true });
  } catch (error) {
    return highlightJsonError(error);
  }
}
