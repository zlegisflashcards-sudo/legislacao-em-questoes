import { strFromU8, unzipSync } from "fflate";

export type LegislativeDocumentReference = { ordem: string; identification: string; legislation: string };
export type LegislativeDocumentParse = { references: LegislativeDocumentReference[]; rejected: string[] };

const decode = (value: string) => value.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'");
const escapeHtml = (value: string) => decode(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function enabledProperty(runProperties: string, property: string) {
  const match = new RegExp(`<w:${property}(?:\\s[^>]*)?\\s*/?>`, "i").exec(runProperties);
  return Boolean(match && !/w:val\s*=\s*["'](?:0|false|none)["']/i.test(match[0]));
}

function docxRunHtml(run: string) {
  const properties = /<w:rPr(?:\s[^>]*)?>([\s\S]*?)<\/w:rPr>/i.exec(run)?.[1] ?? "";
  const pieces = [...run.matchAll(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>|<w:tab\s*\/>|<w:br(?:\s[^>]*)?\s*\/>/gi)].map((match) => match[1] !== undefined ? escapeHtml(match[1]) : /^<w:tab/i.test(match[0]) ? "&emsp;" : "<br>");
  let html = pieces.join("");
  if (!html) return "";
  if (enabledProperty(properties, "b")) html = `<strong>${html}</strong>`;
  if (enabledProperty(properties, "i")) html = `<em>${html}</em>`;
  if (enabledProperty(properties, "u")) html = `<u>${html}</u>`;
  const color = /<w:color\b[^>]*w:val\s*=\s*["']([0-9a-f]{6})["'][^>]*\/?\s*>/i.exec(properties)?.[1];
  if (color) html = `<span style="color:#${color}">${html}</span>`;
  return html;
}

function docxParagraphHtml(paragraph: string) {
  const runs = [...paragraph.matchAll(/<w:r(?:\s[^>]*)?>([\s\S]*?)<\/w:r>/gi)].map((match) => docxRunHtml(match[0])).join("");
  return runs.trim() ? `<p>${runs}</p>` : "";
}

function docxTableHtml(table: string) {
  const rows = [...table.matchAll(/<w:tr(?:\s[^>]*)?>([\s\S]*?)<\/w:tr>/gi)].map((row) => {
    const cells = [...row[1].matchAll(/<w:tc(?:\s[^>]*)?>([\s\S]*?)<\/w:tc>/gi)].map((cell) => {
      const content = [...cell[1].matchAll(/<w:p(?:\s[^>]*)?>([\s\S]*?)<\/w:p>/gi)].map((paragraph) => docxParagraphHtml(paragraph[0]).replace(/^<p>|<\/p>$/g, "")).filter(Boolean).join("<br>");
      return `<td>${content}</td>`;
    }).join("");
    return cells ? `<tr>${cells}</tr>` : "";
  }).join("");
  return rows ? `<table><tbody>${rows}</tbody></table>` : "";
}

function docxParagraphs(bytes: Uint8Array) {
  const xml = strFromU8(unzipSync(bytes)["word/document.xml"] ?? new Uint8Array());
  if (!xml) throw new Error("O documento DOCX não possui texto legível.");
  const body = /<w:body(?:\s[^>]*)?>([\s\S]*?)<\/w:body>/i.exec(xml)?.[1] ?? xml;
  return [...body.matchAll(/<w:p(?:\s[^>]*)?>[\s\S]*?<\/w:p>|<w:tbl(?:\s[^>]*)?>[\s\S]*?<\/w:tbl>/gi)]
    .map((match) => /^<w:tbl/i.test(match[0]) ? docxTableHtml(match[0]) : docxParagraphHtml(match[0]))
    .filter(Boolean);
}

export function legislativeDocumentParagraphs(name: string, bytes: Uint8Array) {
  if (/\.docx$/i.test(name)) return docxParagraphs(bytes);
  if (/\.(txt|md)$/i.test(name)) return new TextDecoder().decode(bytes).replace(/\r\n?/g, "\n").split("\n").map((line) => line.trim()).filter(Boolean);
  throw new Error("Envie um arquivo DOCX, TXT ou Markdown.");
}

type Context = { article?: number; articleLetter?: string; paragraph?: number; paragraphLetter?: string; inciso?: number; incisoLetter?: string };
function orderOf(value: Context) { return [String(value.article ?? 0).padStart(4, "0"), value.articleLetter ?? "0", String(value.paragraph ?? 0).padStart(2, "0"), value.paragraphLetter ?? "0", String(value.inciso ?? 0).padStart(2, "0"), value.incisoLetter ?? "0"].join("."); }

function heading(value: string, context: Context): Context | null {
  const line = value.replace(/<br\s*\/?\s*>/gi, "\n").replace(/<[^>]+>/g, "").replace(/^#{1,6}\s*/, "").trim();
  const article = /^art\.?\s*(\d+)\s*(?:º|o)?(?:\s*-\s*([a-z]))?\.?$/i.exec(line);
  if (article) return { article: Number(article[1]), articleLetter: article[2]?.toLowerCase() };
  const paragraph = /^§\s*(\d+|único)\s*(?:º|o)?(?:\s*-\s*([a-z]))?\.?$/i.exec(line);
  // Only numbered paragraphs have their own prepared block. Parágrafo único,
  // incisos and alíneas stay in the current continuous reading block.
  if (paragraph && context.article && paragraph[1].toLowerCase() !== "único") return { ...context, paragraph: Number(paragraph[1]), paragraphLetter: paragraph[2]?.toLowerCase(), inciso: undefined, incisoLetter: undefined };
  return null;
}

/** Parses one article and its children. Text is kept per heading; no parent text is copied into child references. */
export function parseLegislativeDocument(paragraphs: string[]): LegislativeDocumentParse {
  const references: LegislativeDocumentReference[] = [];
  const rejected: string[] = [];
  let context: Context = {};
  let current: { context: Context; identification: string; lines: string[] } | null = null;
  const flush = () => { if (!current) return; const legislation = current.lines.join("\n\n").trim(); if (!legislation) rejected.push(`${current.identification}: sem texto legislativo.`); else references.push({ ordem: orderOf(current.context), identification: current.identification, legislation }); current = null; };
  for (const paragraph of paragraphs) {
    const plainParagraph = decode(paragraph.replace(/<br\s*\/?\s*>/gi, "\n").replace(/<[^>]+>/g, "")).trim();
    const next = heading(paragraph, context);
    if (next) {
      flush();
      context = next;
      // The structural heading is legal text too. Keep it in the saved body so
      // the reading page never loses the visible Art./§ identifier.
      current = { context, identification: plainParagraph.replace(/^#{1,6}\s*/, "").trim(), lines: [paragraph] };
      continue;
    }
    if (!current) { rejected.push(`${plainParagraph.slice(0, 80)}: texto fora de um título estrutural.`); continue; }
    current.lines.push(paragraph);
  }
  flush();
  const unique = new Map<string, LegislativeDocumentReference>();
  for (const reference of references) { if (unique.has(reference.ordem)) rejected.push(`${reference.identification}: Ordem repetida (${reference.ordem}).`); else unique.set(reference.ordem, reference); }
  return { references: [...unique.values()], rejected };
}
