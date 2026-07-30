import "server-only";
import sanitizeHtml from "sanitize-html";
import { legalHtmlToPlainText } from "@/lib/legisbot-community";

const TAGS_PERMITIDAS = [
  "br",
  "b",
  "strong",
  "i",
  "em",
  "u",
  "mark",
  "p",
  "div",
  "ul",
  "ol",
  "li",
  "blockquote",
  "table",
  "thead",
  "tbody",
  "tr",
  "th",
  "td",
  "section",
  "article",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
] as const;

export function sanitizarHtmlLegislacao(html: string): string {
  const htmlSemFormatacaoVisual = sanitizeHtml(html, {
    allowedTags: [...TAGS_PERMITIDAS],
    allowedAttributes: {},
    nonTextTags: [
      "script",
      "style",
      "textarea",
      "option",
      "noscript",
      "iframe",
      "object",
      "embed",
      "form",
    ],
    disallowedTagsMode: "discard",
    enforceHtmlBoundary: true,
  });

  return legalHtmlToPlainText(htmlSemFormatacaoVisual);
}

export function possuiTextoLegislacao(htmlSanitizado: string): boolean {
  return legalHtmlToPlainText(htmlSanitizado).trim().length > 0;
}
