import "server-only";
import sanitizeHtml from "sanitize-html";

const TAGS_PERMITIDAS = [
  "br",
  "b",
  "strong",
  "i",
  "em",
  "u",
  "mark",
  "p",
] as const;

export function sanitizarHtmlLegislacao(html: string): string {
  return sanitizeHtml(html, {
    allowedTags: [...TAGS_PERMITIDAS],
    allowedAttributes: {},
    nonTextTags: ["script", "style", "textarea", "option", "noscript"],
    disallowedTagsMode: "discard",
    enforceHtmlBoundary: true,
  }).trim();
}

export function possuiTextoLegislacao(htmlSanitizado: string): boolean {
  return sanitizeHtml(htmlSanitizado, {
    allowedTags: [],
    allowedAttributes: {},
  })
    .replace(/&nbsp;/gi, " ")
    .trim().length > 0;
}
