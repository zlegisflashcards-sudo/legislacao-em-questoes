import { findHierarchicalLegisBotComment } from "@/lib/legisbot/generation-repository";
import { handleLegisBotRead } from "@/lib/legisbot/read-api";
import { findHierarchicalLegisBotSource } from "@/lib/legisbot/source";
import { getSupabaseServerClient } from "@/lib/supabase-server";
import { registerLegisBotIncident } from "@/lib/legisbot/incident";

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
        find: (identifiers) => findHierarchicalLegisBotComment(supabase, identifiers),
        resolveSource: (identifiers) => findHierarchicalLegisBotSource(supabase, identifiers),
        reportIssue: ({ identifiers, type }) => registerLegisBotIncident(supabase, { slug: identifiers.slug, ordem: identifiers.ordem, type }),
      },
    ),
    supabase
      .from("article_context_mappings")
      .select("incidencia,artigo_recente")
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
      artigo_recente: mapping.data?.artigo_recente === true,
    },
    { status: response.status, headers: { "Cache-Control": "no-store" } },
  );
}
