import { expectedQuestionOrder, parseQuestionSubject } from "@/lib/question-structure-consistency";
import { sanitizeLegisQuestoesHtml } from "@/lib/legis-questoes-html";

export class LawShadowDocError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

type DocsTextStyle = { bold?: boolean };
type DocsRun = { content?: string; textStyle?: DocsTextStyle };
type DocsParagraph = { elements?: Array<{ textRun?: DocsRun }>; paragraphStyle?: { namedStyleType?: string }; html?: string };
type DocsTableCell = { content?: DocsContent[] };
type DocsTable = { tableRows?: Array<{ tableCells?: DocsTableCell[] }>; html?: string };
type DocsContent = { paragraph?: DocsParagraph; table?: DocsTable };
export type GoogleDocument = { documentId?: string; revisionId?: string; title?: string; body?: { content?: DocsContent[] } };

export type LawShadowUnitDraft = {
  key: string;
  ordem: string | null;
  assunto: string;
  tipo: "caput" | "paragrafo";
  texto_html: string;
  texto_plano: string;
  caminho_estrutural: string[];
  ambiguous: boolean;
  warnings: string[];
};

const escapeHtml = (value: string) => value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\"/g, "&quot;").replace(/'/g, "&#39;");
const plain = (html: string) => html.replace(/<[^>]*>/g, "").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/\s+/g, " ").trim();
const normalize = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " ").trim().toLowerCase();

export function googleDocumentId(value: string | null | undefined) {
  if (!value) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.hostname !== "docs.google.com") return null;
    // Google commonly adds the signed-in profile segment when the link is copied
    // from the editor: /document/u/0/d/<id>/edit. It is the same document URL.
    const match = url.pathname.match(/^\/document(?:\/u\/\d+)?\/d\/([A-Za-z0-9_-]+)(?:\/|$)/);
    return match?.[1] ?? null;
  } catch { return null; }
}

/** Turns pasted legal text into the same neutral document representation used by the Docs reader. */
export function pastedLawTextToDocument(value: string): GoogleDocument {
  const normalized = value.replace(/\r\n?/g, "\n").trim();
  if (!normalized) throw new LawShadowDocError(422, "Cole o texto legal antes de analisar.");
  if (normalized.length > 2_000_000) throw new LawShadowDocError(413, "O texto colado excede o limite de 2 MB para a análise.");
  const units: string[] = [];
  for (const group of normalized.split(/\n\s*\n+/)) {
    let current = "";
    for (const line of group.split("\n").map((item) => item.trim()).filter(Boolean)) {
      // A new article or paragraph is always a separate legal unit. Other
      // line breaks remain in the current unit, preserving the pasted text.
      if ((/^art\.\s*\d+/i.test(line) || /^§\s*(?:\d+|único|par[aá]grafo\s+único)/i.test(line)) && current) { units.push(current); current = line; }
      else current = current ? `${current}\n${line}` : line;
    }
    if (current) units.push(current);
  }
  return {
    documentId: "pasted-law-text",
    title: "Texto legal colado",
    body: { content: units.map((content) => ({ paragraph: { elements: [{ textRun: { content } }], paragraphStyle: { namedStyleType: "NORMAL_TEXT" } } })) },
  };
}

async function accessToken() {
  const email = process.env.GOOGLE_DOCS_READER_SERVICE_ACCOUNT_EMAIL?.trim();
  const key = process.env.GOOGLE_DOCS_READER_PRIVATE_KEY?.replace(/\\n/g, "\n");
  if (!email || !key) throw new LawShadowDocError(503, "Leitura do Google Docs não configurada: defina GOOGLE_DOCS_READER_SERVICE_ACCOUNT_EMAIL e GOOGLE_DOCS_READER_PRIVATE_KEY e compartilhe o documento com essa conta de serviço.");
  try {
    const { JWT } = require("google-auth-library") as { JWT: new (options: { email: string; key: string; scopes: string[]; subject?: string }) => { getAccessToken: () => Promise<{ token?: string } | null> } };
    const client = new JWT({ email, key, scopes: ["https://www.googleapis.com/auth/documents.readonly"], subject: process.env.GOOGLE_DOCS_READER_SUBJECT?.trim() || undefined });
    const result = await client.getAccessToken();
    if (!result?.token) throw new Error("token ausente");
    return result.token;
  } catch (error) {
    console.error("law_shadow_docs_auth_failed", { message: error instanceof Error ? error.message : "unknown" });
    throw new LawShadowDocError(503, "Não foi possível autenticar a leitura do Google Docs. Verifique a conta de serviço e a chave configuradas no ambiente.");
  }
}

export async function readGoogleDocument(documentId: string, fetchImpl: typeof fetch = fetch): Promise<GoogleDocument> {
  const token = await accessToken();
  const response = await fetchImpl(`https://docs.googleapis.com/v1/documents/${encodeURIComponent(documentId)}`, { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" });
  if (response.status === 401 || response.status === 403) throw new LawShadowDocError(403, "A conta configurada não possui leitura deste Google Docs. Compartilhe o documento com a conta de serviço de leitura.");
  if (response.status === 404) throw new LawShadowDocError(404, "O Google Docs vinculado não foi encontrado.");
  if (!response.ok) throw new LawShadowDocError(502, `Não foi possível ler o Google Docs (HTTP ${response.status}).`);
  return await response.json() as GoogleDocument;
}

const isPublicDocsHost = (hostname: string) => hostname === "docs.google.com" || hostname === "docs.googleusercontent.com" || hostname.endsWith(".googleusercontent.com");
const publicDocumentMaxBytes = 5_000_000;
const decodeHtml = (value: string) => value
  .replace(/&nbsp;/gi, " ").replace(/&amp;/gi, "&").replace(/&lt;/gi, "<").replace(/&gt;/gi, ">")
  .replace(/&quot;/gi, '"').replace(/&#39;/gi, "'").replace(/&#(x[0-9a-f]+|\d+);/gi, (_all, entity) => {
    const code = String(entity).toLowerCase().startsWith("x") ? Number.parseInt(String(entity).slice(1), 16) : Number.parseInt(String(entity), 10);
    return Number.isSafeInteger(code) ? String.fromCodePoint(code) : "";
  });
const publicDocAccessBlocked = (value: string) => /accounts\.google\.com|servicelogin|\b(sign in|log in|request access|you need permission)\b|fa[çc]a login|solicitar acesso|voc[êe] precisa de permiss[aã]o/i.test(value);
async function readPublicHtml(response: Response) {
  const declaredLength = Number(response.headers.get("content-length") ?? 0);
  if (Number.isFinite(declaredLength) && declaredLength > publicDocumentMaxBytes) throw new LawShadowDocError(413, "O Google Docs é grande demais para análise direta (máximo de 5 MB exportados).");
  if (!response.body) return await response.text();
  const reader = response.body.getReader(); const chunks: Uint8Array[] = []; let size = 0;
  while (true) {
    const next = await reader.read();
    if (next.done) break;
    size += next.value.byteLength;
    if (size > publicDocumentMaxBytes) { await reader.cancel(); throw new LawShadowDocError(413, "O Google Docs é grande demais para análise direta (máximo de 5 MB exportados)."); }
    chunks.push(next.value);
  }
  const content = new Uint8Array(size); let offset = 0;
  for (const chunk of chunks) { content.set(chunk, offset); offset += chunk.byteLength; }
  return new TextDecoder().decode(content);
}

/**
 * Converts the limited, export-only HTML emitted by Google Docs into the same
 * shape returned by the Docs API. It intentionally recognizes only legal
 * document blocks (headings, paragraphs and tables), never arbitrary markup.
 */
export function publicGoogleDocsHtmlToDocument(html: string, documentId = "public-link"): GoogleDocument {
  const body = html.match(/<body\b[^>]*>([\s\S]*?)<\/body\s*>/i)?.[1] ?? html;
  const content: DocsContent[] = [];
  const token = /<!--[\s\S]*?-->|<[^>]*>|[^<]+/g;
  type PublicBlockTag = "p" | "h1" | "h2" | "h3" | "h4" | "h5" | "h6" | "table";
  let active: { tag: PublicBlockTag; depth: number; inner: string } | null = null;
  for (const part of body.match(token) ?? []) {
    const match = part.match(/^<\s*(\/)?\s*(p|h[1-6]|table)\b[^>]*>/i);
    const tag = match?.[2]?.toLowerCase() as PublicBlockTag | undefined;
    if (!active && match && !match[1] && tag) { active = { tag, depth: 1, inner: "" }; continue; }
    if (!active) continue;
    if (match && !match[1] && tag === active.tag) { active.depth += 1; active.inner += part; continue; }
    if (match && match[1] && tag === active.tag) {
      active.depth -= 1;
      if (active.depth) { active.inner += part; continue; }
      const cleaned = sanitizeLegisQuestoesHtml(active.tag === "table" ? `<table>${active.inner}</table>` : active.inner);
      if (active.tag === "table") content.push({ table: { html: cleaned } });
      else content.push({ paragraph: { html: cleaned, paragraphStyle: { namedStyleType: active.tag === "p" ? "NORMAL_TEXT" : `HEADING_${active.tag.slice(1)}` } } });
      active = null;
      continue;
    }
    active.inner += part;
  }
  return { documentId, body: { content } };
}

/** Reads a deliberately public Docs export. A visual/edit URL alone is never accepted as proof of readable content. */
export async function readPublicGoogleDocument(documentId: string, fetchImpl: typeof fetch = fetch): Promise<GoogleDocument> {
  const response = await fetchImpl(`https://docs.google.com/document/d/${encodeURIComponent(documentId)}/export?format=html`, {
    headers: { Accept: "text/html" }, redirect: "follow", cache: "no-store",
  });
  const responseUrl = new URL(response.url || `https://docs.google.com/document/d/${documentId}/export`);
  if (!isPublicDocsHost(responseUrl.hostname)) throw new LawShadowDocError(502, "A exportação do Google Docs redirecionou para um destino inesperado.");
  if (response.status === 401 || response.status === 403 || response.status === 404) throw new LawShadowDocError(403, "O link não está acessível publicamente. Compartilhe o Google Docs como visualizador para qualquer pessoa com o link ou use a conta de serviço.");
  if (!response.ok) throw new LawShadowDocError(502, `Não foi possível exportar o Google Docs público (HTTP ${response.status}).`);
  if (!/text\/html/i.test(response.headers.get("content-type") ?? "")) throw new LawShadowDocError(422, "O link não retornou uma exportação HTML válida do Google Docs.");
  const html = await readPublicHtml(response);
  if (publicDocAccessBlocked(html)) throw new LawShadowDocError(403, "O link não está acessível publicamente. Compartilhe o Google Docs como visualizador para qualquer pessoa com o link ou use a conta de serviço.");
  const document = publicGoogleDocsHtmlToDocument(html, documentId);
  if (!document.body?.content?.length) throw new LawShadowDocError(422, "A exportação pública não contém parágrafos ou tabelas legíveis. Revise o link e o compartilhamento.");
  return document;
}

function paragraphHtml(paragraph: DocsParagraph) {
  if (paragraph.html !== undefined) return paragraph.html ? `<p>${paragraph.html}</p>` : "";
  const html = (paragraph.elements ?? []).map((element) => {
    const content = element.textRun?.content ?? "";
    if (!content) return "";
    const escaped = escapeHtml(content).replace(/\n/g, "<br>");
    return element.textRun?.textStyle?.bold ? `<strong>${escaped}</strong>` : escaped;
  }).join("").replace(/(?:<br>)+$/g, "");
  return html ? `<p>${html}</p>` : "";
}

function tableHtml(table: DocsTable): string {
  if (table.html !== undefined) return table.html;
  const rows = (table.tableRows ?? []).map((row) => `<tr>${(row.tableCells ?? []).map((cell) => `<td>${(cell.content ?? []).map(contentHtml).join("")}</td>`).join("")}</tr>`).join("");
  return rows ? `<table><tbody>${rows}</tbody></table>` : "";
}
function contentHtml(content: DocsContent): string { return content.paragraph ? paragraphHtml(content.paragraph) : content.table ? tableHtml(content.table) : ""; }
function paragraphText(paragraph: DocsParagraph) { return plain(paragraphHtml(paragraph)); }

function headingLevel(paragraph: DocsParagraph) { const match = (paragraph.paragraphStyle?.namedStyleType ?? "").match(/^HEADING_([1-6])$/); return match ? Number(match[1]) : null; }
const article = (text: string) => text.match(/^art\.\s*(\d+)\s*(?:º|o)?\s*(?:-\s*([a-z]))?\b/i);
const paragraph = (text: string) => text.match(/^§\s*(par[aá]grafo\s+único|único|\d+\s*(?:º|o)?)(?:\s*-\s*([a-z]))?\b/i);
const structural = (text: string) => /^(parte|livro|t[ií]tulo|cap[ií]tulo|se[cç][aã]o|subse[cç][aã]o)\b/i.test(text);

function referenceForArticle(match: RegExpMatchArray) { return `Art. ${match[1]}${match[2] ? `-${match[2].toUpperCase()}` : ""}`; }
function referenceForParagraph(articleReference: string, match: RegExpMatchArray) {
  const raw = normalize(match[1]);
  if (raw.includes("unico")) return `${articleReference}, § único`;
  const number = match[1].replace(/\s+/g, "").replace(/o$/i, "º");
  const officialNumber = /^\d+$/.test(number) ? `${number}º` : number;
  return `${articleReference}, § ${officialNumber}${match[2] ? `-${match[2].toUpperCase()}` : ""}`;
}

/**
 * Extracts legal devices only from paragraph starts. References in prose and
 * tables never create devices; tables are retained inside the current device.
 */
export function extractLawShadowUnits(document: GoogleDocument): { units: LawShadowUnitDraft[]; warnings: string[] } {
  const units: LawShadowUnitDraft[] = [];
  const warnings: string[] = [];
  let path: string[] = [];
  let current: LawShadowUnitDraft | null = null;
  let currentArticle: string | null = null;
  const append = (html: string) => { if (current && html) { current.texto_html += html; current.texto_plano = plain(current.texto_html); } };
  const begin = (assunto: string, tipo: LawShadowUnitDraft["tipo"], firstHtml: string) => {
    const subject = parseQuestionSubject(assunto);
    const ordem = subject ? expectedQuestionOrder({ artigo: subject.article, letraArtigo: subject.suffix, paragrafo: subject.paragraph, letraParagrafo: subject.paragraphSuffix }) : undefined;
    const ambiguous = !ordem;
    current = { key: ordem ?? `ambiguous:${units.length + 1}`, ordem: ordem ?? null, assunto, tipo, texto_html: firstHtml, texto_plano: plain(firstHtml), caminho_estrutural: [...path], ambiguous, warnings: ambiguous ? ["Não foi possível derivar uma Ordem no padrão atual; revise manualmente antes de confirmar."] : [] };
    units.push(current);
  };
  for (const content of document.body?.content ?? []) {
    if (content.table) { if (current) append(tableHtml(content.table)); else warnings.push("Há uma tabela antes do primeiro dispositivo; ela não foi tratada como artigo."); continue; }
    if (!content.paragraph) continue;
    const text = paragraphText(content.paragraph);
    const html = paragraphHtml(content.paragraph);
    if (!text) continue;
    const level = headingLevel(content.paragraph);
    if (level) { path = [...path.slice(0, level - 1), text]; continue; }
    if (structural(text)) { path = [...path, text]; continue; }
    const art = article(text);
    if (art) { currentArticle = referenceForArticle(art); begin(currentArticle, "caput", html); continue; }
    const para = paragraph(text);
    if (para && currentArticle) { begin(referenceForParagraph(currentArticle, para), "paragrafo", html); continue; }
    if (para && !currentArticle) { warnings.push(`Parágrafo sem artigo anterior: “${text.slice(0, 80)}”.`); if (current) append(html); continue; }
    append(html);
  }
  for (const unit of units) if (!unit.texto_plano) unit.warnings.push("Unidade sem texto legível.");
  if (!units.length) warnings.push("Nenhum caput ou parágrafo foi identificado. Revise o formato do Google Docs.");
  return { units, warnings };
}
