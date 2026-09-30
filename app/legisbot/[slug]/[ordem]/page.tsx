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
  const communityCount = await getPublicCommunityContributionCount(slug, ordem).catch((error) => {
    console.error("[LegisBot] Não foi possível carregar a contagem pública da comunidade.", {
      slug,
      ordem,
      tipo: error instanceof Error ? error.name : "unknown",
    });
    return 0;
  });

  return (
    <LegisBotPageClient
      slug={slug}
      ordem={ordem}
      dadosIniciais={{ titulo: source?.titulo ?? "", assunto: source?.assunto ?? "", legislacao: source?.legislacao ?? "" }}
      initialCommunityCount={communityCount}
      initialTab={initialTab}
      adminShortcut={<AdminEditCommentShortcut slug={slug} ordem={ordem} />}
    />
  );
}
