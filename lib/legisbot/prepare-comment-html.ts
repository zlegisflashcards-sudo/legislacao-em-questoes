import { marked } from "marked";

import { sanitizarComentarioHtml } from "@/lib/legisbot/sanitize-comment-html";

const HTML_TAG_PATTERN = /<\/?[a-z][^>]*>/i;
const VOID_TAGS = new Set(["br", "hr"]);
const VALIDATED_TAGS = new Set([
  "a",
  "blockquote",
  "div",
  "em",
  "h2",
  "h3",
  "hr",
  "li",
  "ol",
  "p",
  "strong",
  "table",
  "tbody",
  "td",
  "th",
  "thead",
  "tr",
  "ul",
]);

export function comentarioPareceHtml(value: string): boolean {
  return HTML_TAG_PATTERN.test(value);
}

export function prepararComentarioParaEditor(value: string | null | undefined): string {
  const original = value?.trim() ?? "";

  if (!original) {
    return "";
  }

  if (comentarioPareceHtml(original)) {
    return sanitizarComentarioHtml(original);
  }

  const converted = marked.parse(original, {
    async: false,
    breaks: true,
    gfm: true,
  }) as string;

  return sanitizarComentarioHtml(converted);
}

export function validarEstruturaHtml(value: string): string | null {
  const stack: string[] = [];
  const tagPattern = /<\/?([a-z][\w-]*)(?:\s[^<>]*?)?\s*\/?>/gi;

  for (const match of value.matchAll(tagPattern)) {
    const completeTag = match[0];
    const tagName = match[1].toLowerCase();

    if (!VALIDATED_TAGS.has(tagName) || VOID_TAGS.has(tagName) || completeTag.endsWith("/>")) {
      continue;
    }

    if (completeTag.startsWith("</")) {
      const expected = stack.pop();

      if (expected !== tagName) {
        return expected
          ? `HTML incompleto: esperado </${expected}> antes de </${tagName}>.`
          : `HTML incompleto: </${tagName}> não possui uma tag de abertura.`;
      }

      continue;
    }

    stack.push(tagName);
  }

  const unclosed = stack.at(-1);
  return unclosed ? `HTML incompleto: falta fechar a tag <${unclosed}>.` : null;
}
