import sanitizeHtml from "sanitize-html";

const allowedTags = [
  "a", "b", "blockquote", "br", "caption", "code", "col", "colgroup",
  "div", "em", "hr", "i", "img", "li", "mark", "ol", "p", "pre",
  "s", "small", "span", "strong", "sub", "sup", "table", "tbody",
  "td", "tfoot", "th", "thead", "tr", "u", "ul",
];

const color = [/^#[0-9a-f]{3,8}$/i, /^rgb\([\d\s,.%]+\)$/i, /^rgba\([\d\s,.%]+\)$/i, /^[a-z]+$/i];
const length = [/^(?:0|[-+]?(?:\d+|\d*\.\d+)(?:px|em|rem|%)?)(?:\s+(?:0|[-+]?(?:\d+|\d*\.\d+)(?:px|em|rem|%)?)){0,3}$/i];
const border = [/^(?:none|(?:\d+|\d*\.\d+)(?:px)?\s+(?:solid|dashed|dotted)\s+(?:#[0-9a-f]{3,8}|rgb\([\d\s,.%]+\)|rgba\([\d\s,.%]+\)|[a-z]+))$/i];
const size = [/^(?:auto|(?:\d+|\d*\.\d+)(?:px|em|rem|%))$/i];

function normalizeLegacyAnkiHtml(html: string) {
  return html
    .replace(/<markstyle\s*=\s*["']?([^>"']*)["']?\s*>/gi, (_tag, style) => '<mark style="' + style + '">')
    .replace(/<\/markstyle\s*>/gi, "</mark>");
}

function safeLinkAttributes(attribs: Record<string, string>) {
  if (attribs.target !== "_blank") return attribs;
  const rel = new Set((attribs.rel ?? "").split(/\s+/).filter(Boolean));
  rel.add("noopener");
  rel.add("noreferrer");
  return { ...attribs, rel: [...rel].join(" ") };
}

/**
 * Sanitizes the display HTML shared by question, justification and legislation.
 * Stored/imported content is intentionally left untouched.
 */
export function sanitizeLegisQuestoesHtml(html: string): string {
  return sanitizeHtml(normalizeLegacyAnkiHtml(html), {
    allowedTags,
    allowedAttributes: {
      "*": ["class", "title"],
      a: ["href", "target", "rel", "title", "class"],
      img: ["src", "alt", "width", "height", "title", "class"],
      table: ["width", "height", "class", "title"],
      colgroup: ["span", "class", "title"],
      col: ["span", "width", "class", "title"],
      th: ["colspan", "rowspan", "scope", "width", "height", "class", "title"],
      td: ["colspan", "rowspan", "width", "height", "class", "title"],
      ol: ["start", "reversed", "type", "class", "title"],
      li: ["value", "class", "title"],
      span: ["style", "class", "title"],
      mark: ["style", "class", "title"],
      div: ["style", "class", "title"],
      p: ["style", "class", "title"],
    },
    allowedStyles: {
      "*": {
        "text-align": [/^(?:left|right|center|justify)$/i],
        "font-weight": [/^(?:normal|bold|bolder|lighter|[1-9]00)$/i],
        "font-style": [/^(?:normal|italic|oblique)$/i],
        "text-decoration": [/^(?:none|underline|line-through)(?:\s+(?:underline|line-through))?$/i],
        color,
        "background-color": color,
        margin: length,
        padding: length,
        border,
        width: size,
        "max-width": size,
      },
    },
    allowedSchemes: ["http", "https", "mailto", "tel"],
    allowedSchemesByTag: { img: ["http", "https"] },
    transformTags: {
      a: (_tagName, attribs) => ({ tagName: "a", attribs: safeLinkAttributes(attribs) }),
    },
    exclusiveFilter: (frame) => frame.tag === "img" && !frame.attribs.src,
    nonTextTags: ["script", "style", "textarea", "option", "noscript", "iframe", "object", "embed", "form", "input", "button", "select"],
    disallowedTagsMode: "discard",
    enforceHtmlBoundary: true,
  }).trim();
}
