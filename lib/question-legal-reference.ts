const NAMED_HTML_ENTITIES: Record<string, string> = {
  aacute: "á",
  acirc: "â",
  agrave: "à",
  aring: "å",
  atilde: "ã",
  auml: "ä",
  amp: "&",
  apos: "'",
  ccedil: "ç",
  copy: "©",
  eacute: "é",
  ecirc: "ê",
  egrave: "è",
  eth: "ð",
  euml: "ë",
  gt: ">",
  iacute: "í",
  icirc: "î",
  igrave: "ì",
  iuml: "ï",
  laquo: "«",
  lt: "<",
  mdash: "—",
  middot: "·",
  ndash: "–",
  nbsp: " ",
  ntilde: "ñ",
  oacute: "ó",
  ocirc: "ô",
  ograve: "ò",
  ordm: "º",
  ordf: "ª",
  oslash: "ø",
  otilde: "õ",
  ouml: "ö",
  para: "¶",
  quot: '"',
  raquo: "»",
  reg: "®",
  sect: "§",
  szlig: "ß",
  thorn: "þ",
  uacute: "ú",
  ucirc: "û",
  ugrave: "ù",
  uuml: "ü",
  yacute: "ý",
  yuml: "ÿ",
};

function decodeHtmlEntities(value: string) {
  return value.replace(/&(#x[\da-f]+|#\d+|[a-z][a-z\d]+);/gi, (entity, token: string) => {
    const normalized = token.toLowerCase();
    if (normalized.startsWith("#x")) {
      const codePoint = Number.parseInt(normalized.slice(2), 16);
      return Number.isSafeInteger(codePoint) && codePoint >= 0 && codePoint <= 0x10ffff ? String.fromCodePoint(codePoint) : entity;
    }
    if (normalized.startsWith("#")) {
      const codePoint = Number.parseInt(normalized.slice(1), 10);
      return Number.isSafeInteger(codePoint) && codePoint >= 0 && codePoint <= 0x10ffff ? String.fromCodePoint(codePoint) : entity;
    }
    return NAMED_HTML_ENTITIES[normalized] ?? entity;
  });
}

/**
 * Normaliza campos que identificam o dispositivo legal, sem alterar o HTML
 * pedagógico de pergunta, justificativa ou texto de legislação.
 */
export function normalizeQuestionLegalReference(value: string) {
  return decodeHtmlEntities(value)
    .replace(/<!--[\s\S]*?-->|<\/?[a-z][^>]*>/gi, " ")
    .replace(/[\u00a0\t\r\n\f ]+/g, " ")
    .replace(/\s+,/g, ",")
    .trim();
}
