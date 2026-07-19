import LegisBotPageClient from "@/app/legisbot/legisbot-page-client";
import AdminEditCommentShortcut from "@/components/admin/admin-edit-comment-shortcut";
import { sanitizarHtmlLegislacao } from "@/lib/legisbot/sanitize-legal-html";

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

export default async function LegisBotPage({ params, searchParams }: LegisBotPageProps) {
  const [{ slug, ordem }, query] = await Promise.all([params, searchParams]);
  const titulo = primeiroValor(query.titulo).trim();
  const assunto = primeiroValor(query.assunto).trim();
  const legislacao = sanitizarHtmlLegislacao(primeiroValor(query.legislacao));

  return (
    <LegisBotPageClient
      slug={slug}
      ordem={ordem}
      dadosIniciais={{ titulo, assunto, legislacao }}
      adminShortcut={<AdminEditCommentShortcut slug={slug} ordem={ordem} />}
    />
  );
}
