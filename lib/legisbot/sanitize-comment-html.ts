import sanitizeHtml from "sanitize-html";

const TAGS_PERMITIDAS = [
  "p", "br", "strong", "em", "ul", "ol", "li", "h2", "h3",
  "blockquote", "hr", "table", "thead", "tbody", "tr", "th", "td",
  "div", "a",
];

export function sanitizarComentarioHtml(html: string): string {
  return sanitizeHtml(html, {
    allowedTags: TAGS_PERMITIDAS,
    allowedAttributes: {
      a: ["href", "title", "target", "rel"],
      div: ["class"],
      th: ["scope", "colspan", "rowspan"],
      td: ["colspan", "rowspan"],
    },
    allowedClasses: {
      div: ["legisbot-highlight"],
    },
    allowedSchemes: ["http", "https", "mailto"],
    allowedSchemesByTag: { a: ["http", "https", "mailto"] },
    allowProtocolRelative: false,
    transformTags: {
      b: "strong",
      i: "em",
      h4: "h3",
      a: (_tagName, attribs) => ({
        tagName: "a",
        attribs: {
          ...attribs,
          target: "_blank",
          rel: "noopener noreferrer",
        },
      }),
    },
    disallowedTagsMode: "discard",
    nonTextTags: [
      "script", "style", "textarea", "option", "noscript", "iframe", "object",
      "embed", "form", "input", "button",
    ],
    enforceHtmlBoundary: true,
  }).trim();
}
