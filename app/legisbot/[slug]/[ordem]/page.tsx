import LegisBotPageClient from "@/app/legisbot/legisbot-page-client";
import AdminEditCommentShortcut from "@/components/admin/admin-edit-comment-shortcut";
import { getPublicCommunityContributionCount } from "@/lib/legisbot-community-server";
import type { LegisBotStudyTab } from "@/components/legisbot-study-tabs";
import { normalizeLegisBotIdentifiers } from "@/lib/legisbot/request-validation";
import { findLegisBotSource } from "@/lib/legisbot/source";
import { getSupabaseServerClient } from "@/lib/supabase-server";

type LegisBotPageProps = {
  params: Promise<{
    slug: string;
    ordem: string;
  }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

type MappingIncidence = "muito_alta" | "alta" | "media" | "baixa" | "nao_mapeado";
const MAPPING_INCIDENCES = new Set<MappingIncidence>(["muito_alta", "alta", "media", "baixa", "nao_mapeado"]);

function mappingIncidence(value: unknown): MappingIncidence | undefined {
  return typeof value === "string" && MAPPING_INCIDENCES.has(value as MappingIncidence)
    ? value as MappingIncidence
    : undefined;
}

function primeiroValor(valor: string | string[] | undefined): string {
  return Array.isArray(valor) ? valor[0] ?? "" : valor ?? "";
}

function abaInicial(valor: string): LegisBotStudyTab {
  return valor === "community" || valor === "highlights" ? valor : "legisbot";
}

export default async function LegisBotPage({ params, searchParams }: LegisBotPageProps) {
  const [{ slug, ordem }, query] = await Promise.all([params, searchParams]);
  // `aba` existia nos links antigos do Anki. Os dados de conteúdo presentes em
  // query strings legadas são deliberadamente ignorados, mas preservamos a aba.
  const initialTab = abaInicial(primeiroValor(query.tab) || primeiroValor(query.aba));
  const source = await (async () => {
    try {
      return await findLegisBotSource(getSupabaseServerClient(), normalizeLegisBotIdentifiers(slug, ordem));
    } catch {
      return null;
    }
  })();
  const [communityCount, incidence] = await Promise.all([getPublicCommunityContributionCount(slug, ordem).catch((error) => {
    console.error("[LegisBot] Não foi possível carregar a contagem pública da comunidade.", {
      slug,
      ordem,
      tipo: error instanceof Error ? error.name : "unknown",
    });
    return 0;
  }), (async () => {
    const { data, error } = await getSupabaseServerClient()
      .from("article_context_mappings")
      .select("incidencia")
      .eq("slug", slug.trim().toLowerCase())
      .eq("ordem", ordem.trim())
      .maybeSingle();
    if (error) {
      console.error("[LegisBot] Não foi possível carregar a incidência editorial.", { slug, ordem, code: error.code });
      return undefined;
    }
    return mappingIncidence(data?.incidencia);
  })().catch(() => undefined)]);

  return (
    <LegisBotPageClient
      slug={slug}
      ordem={ordem}
      dadosIniciais={{ titulo: source?.titulo ?? "", assunto: source?.assunto ?? "", legislacao: source?.legislacao ?? "" }}
      initialCommunityCount={communityCount}
      initialTab={initialTab}
      mappingIncidence={incidence}
      adminShortcut={<AdminEditCommentShortcut slug={slug} ordem={ordem} />}
    />
  );
}
