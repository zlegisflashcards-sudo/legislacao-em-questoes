import sanitizeHtml from "sanitize-html";
import { decodeHtmlEntities } from "../legisbot-community";

const ALLOWED_TAGS = [
  "br", "b", "strong", "i", "em", "mark", "p", "div", "ul", "ol", "li",
  "blockquote", "table", "thead", "tbody", "tr", "th", "td", "section", "article",
  "h1", "h2", "h3", "h4", "h5", "h6",
] as const;

export function sanitizeLegalHtmlCore(html: string): string {
  return sanitizeHtml(html, {
    allowedTags: [...ALLOWED_TAGS],
    allowedAttributes: { th: ["scope", "colspan", "rowspan"], td: ["colspan", "rowspan"] },
    allowedSchemes: [],
    nonTextTags: ["script", "style", "textarea", "option", "noscript", "iframe", "object", "embed", "form"],
    disallowedTagsMode: "discard",
    enforceHtmlBoundary: true,
  });
}

export function hasLegalTextCore(sanitizedHtml: string): boolean {
  return legalHtmlToStructuredText(sanitizedHtml).trim().length > 0;
}

type LegalNode = { tag: string | null; text: string; children: LegalNode[] };
const VOID_TAGS = new Set(["br"]);

/**
 * Converte HTML legal sanitizado em texto para o prompt sem achatar tabelas,
 * listas ou blocos. O pequeno parser trabalha sobre a lista fechada de tags
 * aceita acima; ele não executa nem interpreta atributos.
 */
export function legalHtmlToStructuredText(input: string): string {
  const html = sanitizeLegalHtmlCore(input);
  const root: LegalNode = { tag: null, text: "", children: [] };
  const stack = [root];
  for (const token of html.match(/<[^>]+>|[^<]+/g) ?? []) {
    if (!token.startsWith("<")) {
      stack.at(-1)!.children.push({ tag: null, text: decodeHtmlEntities(token), children: [] });
      continue;
    }
    const closing = /^<\s*\/\s*([a-z0-9]+)/i.exec(token);
    if (closing) {
      const tag = closing[1].toLowerCase();
      while (stack.length > 1) {
        const node = stack.pop()!;
        if (node.tag === tag) break;
      }
      continue;
    }
    const opening = /^<\s*([a-z0-9]+)/i.exec(token);
    if (!opening) continue;
    const tag = opening[1].toLowerCase();
    const node: LegalNode = { tag, text: "", children: [] };
    stack.at(-1)!.children.push(node);
    if (!VOID_TAGS.has(tag) && !/\/\s*>$/.test(token)) stack.push(node);
  }

  const inline = (node: LegalNode): string => node.tag === null
    ? node.text
    : node.tag === "br"
      ? "\n"
      : node.children.map(inline).join("");
  const cells = (row: LegalNode) => row.children
    .filter((node) => node.tag === "th" || node.tag === "td")
    .map((node) => inline(node).replace(/\s+/g, " ").trim())
    .filter(Boolean);
  const render = (node: LegalNode): string => {
    if (node.tag === null) return node.text;
    if (node.tag === "br") return "\n";
    if (node.tag === "table") {
      const rows: LegalNode[] = [];
      const collectRows = (current: LegalNode) => {
        if (current.tag === "tr") rows.push(current);
        else current.children.forEach(collectRows);
      };
      collectRows(node);
      return rows.map((row) => {
        const values = cells(row);
        if (values.length === 2) return `${values[0]}: ${values[1]}${/[.!?;:]$/.test(values[1]) ? "" : "."}`;
        return values.join(" | ");
      }).filter(Boolean).join("\n") + "\n\n";
    }
    if (node.tag === "li") return `- ${node.children.map(render).join("").trim()}\n`;
    const content = node.children.map(render).join("");
    if (["p", "div", "blockquote", "section", "article", "h1", "h2", "h3", "h4", "h5", "h6"].includes(node.tag)) return `${content.trim()}\n\n`;
    if (["ul", "ol"].includes(node.tag)) return `${content.trimEnd()}\n\n`;
    return content;
  };

  return root.children.map(render).join("")
    .replace(/\u00a0/g, " ")
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
