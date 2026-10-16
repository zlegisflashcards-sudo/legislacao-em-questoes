import { strFromU8, unzipSync } from "fflate";

export type LegislativeDocumentReference = { ordem: string; identification: string; legislation: string };
export type LegislativeDocumentParse = { references: LegislativeDocumentReference[]; rejected: string[] };

const decode = (value: string) => value.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'");
const roman: Record<string, number> = { I: 1, V: 5, X: 10, L: 50, C: 100, D: 500, M: 1000 };
const romanNumber = (value: string) => { let total = 0; const letters = value.toUpperCase().split(""); for (let index = 0; index < letters.length; index += 1) { const current = roman[letters[index]]; const next = roman[letters[index + 1]] ?? 0; if (!current) return null; total += current < next ? -current : current; } return total || null; };

function docxParagraphs(bytes: Uint8Array) {
  const xml = strFromU8(unzipSync(bytes)["word/document.xml"] ?? new Uint8Array());
  if (!xml) throw new Error("O documento DOCX não possui texto legível.");
  return [...xml.matchAll(/<w:p(?:\s[^>]*)?>([\s\S]*?)<\/w:p>/g)].map((match) => decode(match[1]
    .replace(/<w:tab\s*\/>/g, "\t").replace(/<w:br\s*\/>/g, "\n")
    .replace(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/g, "$1").replace(/<[^>]+>/g, "").trim())).filter(Boolean);
}

export function legislativeDocumentParagraphs(name: string, bytes: Uint8Array) {
  if (/\.docx$/i.test(name)) return docxParagraphs(bytes);
  if (/\.(txt|md)$/i.test(name)) return new TextDecoder().decode(bytes).replace(/\r\n?/g, "\n").split("\n").map((line) => line.trim()).filter(Boolean);
  throw new Error("Envie um arquivo DOCX, TXT ou Markdown.");
}

type Context = { article?: number; articleLetter?: string; paragraph?: number; paragraphLetter?: string; inciso?: number; incisoLetter?: string };
function orderOf(value: Context) { return [String(value.article ?? 0).padStart(4, "0"), value.articleLetter ?? "0", String(value.paragraph ?? 0).padStart(2, "0"), value.paragraphLetter ?? "0", String(value.inciso ?? 0).padStart(2, "0"), value.incisoLetter ?? "0"].join("."); }

function heading(value: string, context: Context): Context | null {
  const line = value.replace(/^#{1,6}\s*/, "").trim();
  const article = /^art\.?\s*(\d+)\s*(?:º|o)?(?:\s*-\s*([a-z]))?\.?$/i.exec(line);
  if (article) return { article: Number(article[1]), articleLetter: article[2]?.toLowerCase() };
  const paragraph = /^§\s*(\d+|único)\s*(?:º|o)?(?:\s*-\s*([a-z]))?\.?$/i.exec(line);
  if (paragraph && context.article) return { ...context, paragraph: paragraph[1].toLowerCase() === "único" ? 1 : Number(paragraph[1]), paragraphLetter: paragraph[2]?.toLowerCase(), inciso: undefined, incisoLetter: undefined };
  const item = /^(?:inciso\s+)?([ivxlcdm]+)(?:\s*-\s*([a-z]))?\.?$/i.exec(line);
  if (item && context.article) { const inciso = romanNumber(item[1]); return inciso ? { ...context, inciso, incisoLetter: item[2]?.toLowerCase() } : null; }
  const letter = /^(?:alínea\s+)?([a-z])\)?$/i.exec(line);
  if (letter && context.article && context.inciso) return { ...context, incisoLetter: letter[1].toLowerCase() };
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
    const next = heading(paragraph, context);
    if (next) { flush(); context = next; current = { context, identification: paragraph.replace(/^#{1,6}\s*/, "").trim(), lines: [] }; continue; }
    if (!current) { rejected.push(`${paragraph.slice(0, 80)}: texto fora de um título estrutural.`); continue; }
    current.lines.push(paragraph);
  }
  flush();
  const unique = new Map<string, LegislativeDocumentReference>();
  for (const reference of references) { if (unique.has(reference.ordem)) rejected.push(`${reference.identification}: Ordem repetida (${reference.ordem}).`); else unique.set(reference.ordem, reference); }
  return { references: [...unique.values()], rejected };
}
