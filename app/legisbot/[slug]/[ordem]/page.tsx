import LegisBotPageClient from "@/app/legisbot/legisbot-page-client";
import { sanitizarHtmlLegislacao } from "@/lib/legisbot/sanitize-legal-html";
import { getLegislacoes, getYoutubeEmbedUrl } from "@/lib/legislacoes";

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

function obterLegiscastYoutube(legiscastUrl?: string) {
  if (!legiscastUrl) return null;

  try {
    const urlOriginal = new URL(legiscastUrl);
    const hostOriginal = urlOriginal.hostname.replace(/^www\./, "");
    if (!["youtube.com", "youtu.be"].includes(hostOriginal)) return null;

    const playlistId = urlOriginal.searchParams.get("list");
    const embedUrl = playlistId
      ? `https://www.youtube.com/embed/videoseries?list=${encodeURIComponent(playlistId)}`
      : getYoutubeEmbedUrl(legiscastUrl);
    const urlEmbed = new URL(embedUrl);
    const hostEmbed = urlEmbed.hostname.replace(/^www\./, "");
    if (urlEmbed.protocol !== "https:" || hostEmbed !== "youtube.com" || !urlEmbed.pathname.startsWith("/embed/")) {
      return null;
    }

    const kind = playlistId || urlEmbed.pathname === "/embed/videoseries"
      ? "playlist"
      : "video";

    return { embedUrl, watchUrl: legiscastUrl, kind } as const;
  } catch {
    return null;
  }
}

export default async function LegisBotPage({ params, searchParams }: LegisBotPageProps) {
  const [{ slug, ordem }, query] = await Promise.all([params, searchParams]);
  const legislacoes = await getLegislacoes();
  const legislacaoDoCatalogo = legislacoes.find(
    (item) => item.slug.trim().toUpperCase() === slug.trim().toUpperCase(),
  );
  const legiscast = obterLegiscastYoutube(legislacaoDoCatalogo?.legiscastUrl);
  const titulo = primeiroValor(query.titulo).trim();
  const assunto = primeiroValor(query.assunto).trim();
  const legislacao = sanitizarHtmlLegislacao(primeiroValor(query.legislacao));

  return (
    <LegisBotPageClient
      slug={slug}
      ordem={ordem}
      dadosIniciais={{ titulo, assunto, legislacao }}
      legiscast={legiscast}
    />
  );
}
