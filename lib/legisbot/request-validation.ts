import { sanitizeLegalHtmlCore } from "./sanitize-legal-html-core";

export const LEGISBOT_MAX_BODY_BYTES = 24 * 1024;
export const LEGISBOT_MAX_LEGISLATION_CHARS = 16_000;

const SLUG_PATTERN = /^[A-Z0-9_-]{1,50}$/;
const ORDER_PATTERN = /^[A-Za-z0-9._-]{1,20}$/;
const INVALID_CONTROLS = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g;

export class LegisBotRequestError extends Error {
  constructor(
    public readonly status: number,
    public readonly publicMessage: string,
    public readonly reason?: "body_too_large" | "invalid_origin" | "invalid_input",
  ) {
    super(publicMessage);
    this.name = "LegisBotRequestError";
  }
}

export type LegisBotIdentifiers = { slug: string; ordem: string };
export type LegisBotGenerationInput = {
  titulo: string | null;
  assunto: string | null;
  legislacao: string | null;
};

export function normalizeLegisBotIdentifiers(slugValue: string, orderValue: string): LegisBotIdentifiers {
  const slug = slugValue.trim().toUpperCase();
  const ordem = orderValue.trim();
  if (!SLUG_PATTERN.test(slug) || !ORDER_PATTERN.test(ordem)) {
    throw new LegisBotRequestError(400, "Os identificadores do trecho são inválidos.", "invalid_input");
  }
  return { slug, ordem };
}

function normalizeShortText(value: unknown, field: string): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== "string") {
    throw new LegisBotRequestError(400, `${field} deve ser um texto.`, "invalid_input");
  }
  const normalized = value.normalize("NFC").replace(INVALID_CONTROLS, "").trim();
  if (normalized.length > 255) {
    throw new LegisBotRequestError(400, `${field} excede 255 caracteres.`, "invalid_input");
  }
  return normalized || null;
}

function normalizeLegislation(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== "string") {
    throw new LegisBotRequestError(400, "legislacao deve ser um texto.", "invalid_input");
  }
  const normalized = value
    .normalize("NFC")
    .replace(/\r\n?/g, "\n")
    .replace(INVALID_CONTROLS, "");
  const legislation = sanitizeLegalHtmlCore(normalized)
    .normalize("NFC")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{2,}/g, "\n")
    .trim();
  if (!legislation) {
    throw new LegisBotRequestError(400, "A legislação está vazia após a sanitização.", "invalid_input");
  }
  if (legislation.length > LEGISBOT_MAX_LEGISLATION_CHARS) {
    throw new LegisBotRequestError(413, "A legislação excede o limite permitido.", "body_too_large");
  }
  return legislation;
}

export async function readLegisBotGenerationBody(request: Request): Promise<LegisBotGenerationInput> {
  const contentType = request.headers.get("content-type")?.toLowerCase() ?? "";
  if (!contentType.startsWith("application/json")) {
    throw new LegisBotRequestError(415, "Envie os dados em JSON.", "invalid_input");
  }

  const declaredLength = Number(request.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > LEGISBOT_MAX_BODY_BYTES) {
    throw new LegisBotRequestError(413, "O corpo da solicitação excede 24 KB.", "body_too_large");
  }

  const bytes = new Uint8Array(await request.arrayBuffer());
  if (bytes.byteLength > LEGISBOT_MAX_BODY_BYTES) {
    throw new LegisBotRequestError(413, "O corpo da solicitação excede 24 KB.", "body_too_large");
  }

  let body: unknown;
  try {
    body = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch {
    throw new LegisBotRequestError(400, "O JSON enviado é inválido.", "invalid_input");
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new LegisBotRequestError(400, "O JSON enviado é inválido.", "invalid_input");
  }
  const record = body as Record<string, unknown>;
  return {
    titulo: normalizeShortText(record.titulo, "titulo"),
    assunto: normalizeShortText(record.assunto, "assunto"),
    legislacao: normalizeLegislation(record.legislacao),
  };
}

export function validateLegisBotRequestOrigin(request: Request): void {
  const originHeader = request.headers.get("origin");
  if (!originHeader) return;

  let origin: string;
  try {
    origin = new URL(originHeader).origin;
  } catch {
    throw new LegisBotRequestError(403, "Origem da solicitação não permitida.", "invalid_origin");
  }

  const allowed = new Set<string>([new URL(request.url).origin]);
  for (const configured of [
    process.env.NEXT_PUBLIC_SITE_URL,
    process.env.VERCEL_PROJECT_PRODUCTION_URL,
    process.env.VERCEL_URL,
  ]) {
    if (!configured) continue;
    try {
      const url = configured.startsWith("http") ? configured : `https://${configured}`;
      allowed.add(new URL(url).origin);
    } catch {
      // Configuração inválida não amplia a lista de origens permitidas.
    }
  }
  if (!allowed.has(origin)) {
    throw new LegisBotRequestError(403, "Origem da solicitação não permitida.", "invalid_origin");
  }
}
