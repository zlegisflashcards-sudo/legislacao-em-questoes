export const COMMUNITY_PAGE_SIZE = 20;
export const COMMUNITY_MIN_LENGTH = 3;
export const COMMUNITY_MAX_LENGTH = 3000;
export const COMMUNITY_QUOTE_MAX_LENGTH = 1000;

export type CommunitySort = "relevant" | "recent" | "oldest";
export type CommunityStatus = "publicado" | "oculto" | "removido" | "em_analise";

export type CommunityComment = {
  id: string;
  parentId: string | null;
  content: string | null;
  quotedText: string | null;
  quoteStart: number | null;
  quoteEnd: number | null;
  status: CommunityStatus;
  createdAt: string;
  updatedAt: string;
  edited: boolean;
  publicName: string;
  replyingToName: string | null;
  likeCount: number;
  likedByMe: boolean;
  isOwn: boolean;
  official: boolean;
  replies: CommunityComment[];
};

export function normalizeCommunityIdentifiers(slug: string, ordem: string) {
  const normalizedSlug = slug.trim().toUpperCase();
  const normalizedOrder = ordem.trim();
  if (!/^[A-Z0-9_-]{1,50}$/.test(normalizedSlug) || !/^[A-Za-z0-9._-]{1,20}$/.test(normalizedOrder)) {
    throw new Error("invalid-identifiers");
  }
  return { slug: normalizedSlug, ordem: normalizedOrder };
}

export function validateCommunityContent(value: string) {
  const content = value.trim().replace(/\r\n?/g, "\n");
  if (content.length < COMMUNITY_MIN_LENGTH) {
    return { ok: false as const, message: `Escreva pelo menos ${COMMUNITY_MIN_LENGTH} caracteres.` };
  }
  if (content.length > COMMUNITY_MAX_LENGTH) {
    return { ok: false as const, message: `O comentário pode ter no máximo ${COMMUNITY_MAX_LENGTH.toLocaleString("pt-BR")} caracteres.` };
  }
  if (/<[^>]+>|https?:\/\/|www\.|\[[^\]]+\]\([^)]+\)|!\[[^\]]*\]\([^)]+\)/i.test(content)) {
    return { ok: false as const, message: "Links, imagens e HTML não são permitidos." };
  }
  return { ok: true as const, content };
}

export function decodeHtmlEntities(value: string) {
  return value.replace(/&(#x?[0-9a-f]+|[a-z][a-z0-9]+);/gi, (entity, code: string) => {
    const caseSensitiveNamed: Record<string, string> = {
      Aacute: "Á", Acirc: "Â", Agrave: "À", Atilde: "Ã",
      Eacute: "É", Ecirc: "Ê", Iacute: "Í", Oacute: "Ó",
      Ocirc: "Ô", Otilde: "Õ", Uacute: "Ú", Ccedil: "Ç",
      aacute: "á", acirc: "â", agrave: "à", atilde: "ã",
      eacute: "é", ecirc: "ê", iacute: "í", oacute: "ó",
      ocirc: "ô", otilde: "õ", uacute: "ú", ccedil: "ç",
    };
    const named: Record<string, string> = {
      nbsp: " ", amp: "&", lt: "<", gt: ">", quot: '"', apos: "'",
      ordm: "º", ordf: "ª", sect: "§", para: "¶", deg: "°",
      ndash: "–", mdash: "—", hellip: "…", laquo: "«", raquo: "»",
      lsquo: "‘", rsquo: "’", ldquo: "“", rdquo: "”", middot: "·",
      copy: "©", reg: "®", euro: "€",
    };
    if (caseSensitiveNamed[code]) return caseSensitiveNamed[code];
    const lower = code.toLowerCase();
    if (named[lower]) return named[lower];
    const numeric = lower.startsWith("#x")
      ? Number.parseInt(lower.slice(2), 16)
      : Number.parseInt(lower.slice(1), 10);
    return Number.isFinite(numeric) ? String.fromCodePoint(numeric) : entity;
  });
}

export function legalHtmlToPlainText(html: string) {
  const textoComEstrutura = html
    .replace(/\r\n?/g, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p\s*>\s*<p(?:\s[^>]*)?>/gi, "\n\n")
    .replace(/<\/(?:div|li)\s*>\s*<p(?:\s[^>]*)?>/gi, "\n\n")
    .replace(/<\/p\s*>\s*<(?:div|li)(?:\s[^>]*)?>/gi, "\n")
    .replace(/<\/(?:div|li)\s*>\s*<(?:div|li)(?:\s[^>]*)?>/gi, "\n")
    .replace(/<\/(?:ul|ol|table|blockquote)\s*>\s*<p(?:\s[^>]*)?>/gi, "\n\n")
    .replace(/<\/(?:p|div|li|h[1-6]|blockquote|tr|th|td|ul|ol|table|section|article)\s*>/gi, "\n")
    .replace(/<[^>]*>/g, "");

  return decodeHtmlEntities(textoComEstrutura)
    .replace(/\u00a0/g, " ")
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
