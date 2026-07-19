import sanitizeHtml from "sanitize-html";

const TAGS_PERMITIDAS = [
  "p", "br", "strong", "b", "em", "i", "ul", "ol", "li", "h2", "h3",
  "h4", "blockquote", "hr", "table", "thead", "tbody", "tr", "th", "td",
  "span", "div",
];

export function sanitizarComentarioHtml(html: string): string {
  return sanitizeHtml(html, {
    allowedTags: TAGS_PERMITIDAS,
    allowedAttributes: {},
    allowedSchemes: ["http", "https", "mailto"],
    allowProtocolRelative: false,
    disallowedTagsMode: "discard",
    nonTextTags: [
      "script", "style", "textarea", "option", "noscript", "iframe", "object",
      "embed", "form", "input", "button",
    ],
    enforceHtmlBoundary: true,
  }).trim();
}
