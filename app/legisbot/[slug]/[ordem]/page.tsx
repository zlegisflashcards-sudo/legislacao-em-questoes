import LegisBotPageClient from "@/app/legisbot/legisbot-page-client";
import AdminEditCommentShortcut from "@/components/admin/admin-edit-comment-shortcut";
import { getPublicCommunityContributionCount } from "@/lib/legisbot-community-server";
import type { LegisBotStudyTab } from "@/components/legisbot-study-tabs";
import { normalizeLegisBotIdentifiers } from "@/lib/legisbot/request-validation";
import { findHierarchicalLegisBotSource } from "@/lib/legisbot/source";
import { getSupabaseServerClient } from "@/lib/supabase-server";
import { redirect } from "next/navigation";
import { continuousBlockAnchor } from "@/lib/legisbot/continuous-reading-core";
import { getContinuousReadingModel, resolveContinuousReference } from "@/lib/legisbot/continuous-reading-server";
import { LawStudyBottomNav } from "@/components/law-study-bottom-nav";
import styles from "../continuous-reading.module.css";
import { PreparationNotice } from "../preparation-notice";

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
  const continuousModel = await getContinuousReadingModel(slug).catch((error) => {
    console.error("[LegisBot] Falha ao verificar a preparação da leitura contínua.", { slug, ordem, tipo: error instanceof Error ? error.name : "unknown" });
    return null;
  });
  if (continuousModel && !continuousModel.integrity.readingAvailable) {
    return <div className="pb-24 lg:pb-0"><main className={styles.page}><PreparationNotice lawName={continuousModel.law.nome_curto || continuousModel.law.titulo} /></main><LawStudyBottomNav slug={continuousModel.law.slug} recorteId={primeiroValor(query.recorte_id) || null} activeMode="lei_interativa" /></div>;
  }
  const continuousReference = await resolveContinuousReference(slug, ordem).catch((error) => {
    console.error("[LegisBot] Falha ao verificar a leitura contínua; mantendo a página compatível.", {
      slug,
      ordem,
      tipo: error instanceof Error ? error.name : "unknown",
    });
    return null;
  });
  if (continuousReference) {
    const tab = initialTab === "legisbot" ? "" : `?tab=${encodeURIComponent(initialTab)}`;
    redirect(`/legisbot/${encodeURIComponent(slug)}${tab}#${continuousBlockAnchor(continuousReference.id)}`);
  }
  const source = await (async () => {
    try {
      return await findHierarchicalLegisBotSource(getSupabaseServerClient(), normalizeLegisBotIdentifiers(slug, ordem));
    } catch {
      return null;
    }
  })();
  const [communityCount, mapping] = await Promise.all([getPublicCommunityContributionCount(slug, ordem).catch((error) => {
    console.error("[LegisBot] Não foi possível carregar a contagem pública da comunidade.", {
      slug,
      ordem,
      tipo: error instanceof Error ? error.name : "unknown",
    });
    return 0;
  }), (async () => {
    const { data, error } = await getSupabaseServerClient()
      .from("article_context_mappings")
      .select("incidencia,artigo_recente")
      .eq("slug", slug.trim().toLowerCase())
      .eq("ordem", ordem.trim())
      .maybeSingle();
    if (error) {
      console.error("[LegisBot] Não foi possível carregar a incidência editorial.", { slug, ordem, code: error.code });
      return { incidence: undefined, recent: false };
    }
    return { incidence: mappingIncidence(data?.incidencia), recent: data?.artigo_recente === true };
  })().catch(() => ({ incidence: undefined, recent: false }))]);

  return (
    <LegisBotPageClient
      slug={slug}
      ordem={ordem}
      dadosIniciais={{ titulo: source?.titulo ?? "", assunto: source?.assunto ?? "", legislacao: source?.legislacao ?? "" }}
      initialCommunityCount={communityCount}
      initialTab={initialTab}
      mappingIncidence={mapping.incidence}
      articleRecent={mapping.recent}
      adminShortcut={<AdminEditCommentShortcut slug={slug} ordem={ordem} />}
    />
  );
}
