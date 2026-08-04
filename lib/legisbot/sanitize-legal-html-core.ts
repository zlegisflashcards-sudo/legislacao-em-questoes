import sanitizeHtml from "sanitize-html";
import { legalHtmlToPlainText } from "../legisbot-community";

const ALLOWED_TAGS = [
  "br", "b", "strong", "i", "em", "u", "mark", "p", "div", "ul", "ol", "li",
  "blockquote", "table", "thead", "tbody", "tr", "th", "td", "section", "article",
  "h1", "h2", "h3", "h4", "h5", "h6",
] as const;

export function sanitizeLegalHtmlCore(html: string): string {
  const visualFormattingRemoved = sanitizeHtml(html, {
    allowedTags: [...ALLOWED_TAGS],
    allowedAttributes: {},
    nonTextTags: ["script", "style", "textarea", "option", "noscript", "iframe", "object", "embed", "form"],
    disallowedTagsMode: "discard",
    enforceHtmlBoundary: true,
  });
  return legalHtmlToPlainText(visualFormattingRemoved);
}

export function hasLegalTextCore(sanitizedHtml: string): boolean {
  return legalHtmlToPlainText(sanitizedHtml).trim().length > 0;
}
