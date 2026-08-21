import LegisBotPageClient from "@/app/legisbot/legisbot-page-client";
import AdminEditCommentShortcut from "@/components/admin/admin-edit-comment-shortcut";
import { sanitizarHtmlLegislacao } from "@/lib/legisbot/sanitize-legal-html";
import { getPublicCommunityContributionCount } from "@/lib/legisbot-community-server";
import type { LegisBotStudyTab } from "@/components/legisbot-study-tabs";

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
  const titulo = primeiroValor(query.titulo).trim();
  const assunto = primeiroValor(query.assunto).trim();
  const legislacao = sanitizarHtmlLegislacao(primeiroValor(query.legislacao));
  const initialTab = abaInicial(primeiroValor(query.tab));
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
      dadosIniciais={{ titulo, assunto, legislacao }}
      initialCommunityCount={communityCount}
      initialTab={initialTab}
      adminShortcut={<AdminEditCommentShortcut slug={slug} ordem={ordem} />}
    />
  );
}
