import { formatLegalReferenceFromOrder } from "@/lib/article-order-structure";
import { expectedQuestionOrder, parseQuestionOrder, parseQuestionSubject } from "@/lib/question-structure-consistency";

export type ManualReferenceDetection = {
  suggestion: { identification: string; ordem: string } | null;
  warning: string | null;
};

const plainText = (value: string) => value
  .replace(/<br\s*\/?\s*>/gi, " ")
  .replace(/<[^>]+>/g, " ")
  .replace(/&nbsp;/gi, " ")
  .replace(/\s+/g, " ")
  .trim();

const escapeHtml = (value: string) => value
  .replace(/&/g, "&amp;")
  .replace(/</g, "&lt;")
  .replace(/>/g, "&gt;")
  .replace(/"/g, "&quot;")
  .replace(/'/g, "&#39;");

/**
 * The manual field accepts both legal HTML and ordinary pasted text. Plain
 * text needs structural markup before sanitization: browsers collapse bare
 * newlines into spaces when the block is rendered later.
 */
export function preserveManualLegislationLineBreaks(value: string) {
  const normalized = value.replace(/\r\n?/g, "\n").trim();
  if (!normalized || /<\/?[a-z][^>]*>/i.test(normalized)) return normalized;
  return normalized
    .split(/\n[\t ]*\n+/)
    .map((paragraph) => `<p>${escapeHtml(paragraph.trim()).replace(/\n/g, "<br>")}</p>`)
    .join("\n");
}

const unique = (items: string[]) => [...new Set(items.map((item) => item.toLowerCase()))];

/**
 * Suggests a canonical Order only when the pasted text points to one device.
 * A complete article may contain several numbered paragraphs, incisos and
 * alíneas. Those descendants remain part of the same editorial block, so they
 * do not make the article ambiguous. Two different articles still do.
 */
export function detectManualLegislativeReference(legislation: string, lawShortName: string | null | undefined): ManualReferenceDetection {
  const text = plainText(legislation);
  // Notas entre parênteses normalmente registram a origem, renumeração ou
  // alteração do dispositivo. Elas não transformam o caput colado em dois
  // blocos (ex.: "Art. 21 ... (primitivo art. 20 renumerado ...)").
  const deviceText = text.replace(/\([^()]*\)/g, " ");
  const articles = unique([...deviceText.matchAll(/\bart(?:igo)?\.?\s*(\d+)\s*(?:[ºo])?(?:\s*-\s*([a-z]))?/gi)].map((match) => `${match[1]}${match[2] ? `-${match[2]}` : ""}`));
  const paragraphs = unique([...deviceText.matchAll(/§\s*(\d+)\s*(?:[ºo])?(?:\s*-\s*([a-z]))?/gi)].map((match) => `${match[1]}${match[2] ? `-${match[2]}` : ""}`));
  if (!articles.length) return { suggestion: null, warning: "Não foi possível identificar um Artigo no trecho. Informe Assunto e Ordem manualmente." };
  if (articles.length > 1) return { suggestion: null, warning: "O trecho contém mais de um Artigo. Escolha Assunto e Ordem manualmente antes de salvar." };
  const subject = parseQuestionSubject(text);
  if (!subject?.article) return { suggestion: null, warning: "A identificação do dispositivo é incerta. Informe Assunto e Ordem manualmente." };
  // When a single pasted article contains more than one paragraph, it is a
  // complete article block rather than a block for its first paragraph. Keep
  // every descendant in the HTML, but identify the reference by the article.
  const completeArticleBlock = paragraphs.length > 1;
  const ordem = expectedQuestionOrder({
    artigo: subject.article,
    letraArtigo: subject.suffix,
    paragrafo: completeArticleBlock ? undefined : subject.paragraph,
    letraParagrafo: completeArticleBlock ? undefined : subject.paragraphSuffix,
    inciso: completeArticleBlock ? undefined : subject.item,
    letraInciso: completeArticleBlock ? undefined : subject.itemSuffix ?? subject.letter,
  });
  if (!ordem) return { suggestion: null, warning: "A Ordem do dispositivo não pôde ser formada com segurança. Informe-a manualmente." };
  const identification = formatLegalReferenceFromOrder(ordem, lawShortName) ?? `Art. ${subject.article}${subject.suffix ? `-${subject.suffix}` : ""}`;
  return { suggestion: { identification, ordem }, warning: null };
}

export function isCanonicalManualReferenceOrder(value: string) {
  return Boolean(parseQuestionOrder(value));
}
