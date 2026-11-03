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

const unique = (items: string[]) => [...new Set(items.map((item) => item.toLowerCase()))];

/**
 * Suggests a canonical Order only when the pasted text points to one device.
 * It deliberately refuses multiple Artigos or numbered paragraphs instead of
 * silently choosing the first one.
 */
export function detectManualLegislativeReference(legislation: string, lawShortName: string | null | undefined): ManualReferenceDetection {
  const text = plainText(legislation);
  const articles = unique([...text.matchAll(/\bart(?:igo)?\.?\s*(\d+)\s*(?:[ºo])?(?:\s*-\s*([a-z]))?/gi)].map((match) => `${match[1]}${match[2] ? `-${match[2]}` : ""}`));
  const paragraphs = unique([...text.matchAll(/§\s*(\d+)\s*(?:[ºo])?(?:\s*-\s*([a-z]))?/gi)].map((match) => `${match[1]}${match[2] ? `-${match[2]}` : ""}`));
  if (!articles.length) return { suggestion: null, warning: "Não foi possível identificar um Artigo no trecho. Informe Assunto e Ordem manualmente." };
  if (articles.length > 1 || paragraphs.length > 1) return { suggestion: null, warning: "O trecho contém mais de um dispositivo. Escolha Assunto e Ordem manualmente antes de salvar." };
  const subject = parseQuestionSubject(text);
  if (!subject?.article) return { suggestion: null, warning: "A identificação do dispositivo é incerta. Informe Assunto e Ordem manualmente." };
  const ordem = expectedQuestionOrder({
    artigo: subject.article,
    letraArtigo: subject.suffix,
    paragrafo: subject.paragraph,
    letraParagrafo: subject.paragraphSuffix,
    inciso: subject.item,
    letraInciso: subject.itemSuffix ?? subject.letter,
  });
  if (!ordem) return { suggestion: null, warning: "A Ordem do dispositivo não pôde ser formada com segurança. Informe-a manualmente." };
  const identification = formatLegalReferenceFromOrder(ordem, lawShortName) ?? `Art. ${subject.article}${subject.suffix ? `-${subject.suffix}` : ""}`;
  return { suggestion: { identification, ordem }, warning: null };
}

export function isCanonicalManualReferenceOrder(value: string) {
  return Boolean(parseQuestionOrder(value));
}
