import { findLegisBotComment, reconcileLegisBotCommentSource } from "@/lib/legisbot/generation-repository";
import { handleLegisBotRead } from "@/lib/legisbot/read-api";
import { findLegisBotSource } from "@/lib/legisbot/source";
import { getSupabaseServerClient } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ slug: string; ordem: string }> };
type MappingIncidence = "muito_alta" | "alta" | "media" | "baixa" | "nao_mapeado";
const MAPPING_INCIDENCES = new Set<MappingIncidence>(["muito_alta", "alta", "media", "baixa", "nao_mapeado"]);

export async function GET(_request: Request, context: RouteContext) {
  const supabase = getSupabaseServerClient();
  const params = await context.params;
  const [response, mapping] = await Promise.all([
    handleLegisBotRead(
      params,
      {
        find: (identifiers) => findLegisBotComment(supabase, identifiers),
        resolveSource: (identifiers) => findLegisBotSource(supabase, identifiers),
        reconcileSource: (source) => reconcileLegisBotCommentSource(supabase, source),
      },
    ),
    supabase
      .from("article_context_mappings")
      .select("incidencia")
      .eq("slug", params.slug.trim().toLowerCase())
      .eq("ordem", params.ordem.trim())
      .maybeSingle(),
  ]);
  const payload = await response.json() as Record<string, unknown>;
  const incidencia = typeof mapping.data?.incidencia === "string" && MAPPING_INCIDENCES.has(mapping.data.incidencia as MappingIncidence)
    ? mapping.data.incidencia as MappingIncidence
    : "nao_mapeado";
  return Response.json(
    {
      ...payload,
      incidencia,
    },
    { status: response.status, headers: { "Cache-Control": "no-store" } },
  );
}
