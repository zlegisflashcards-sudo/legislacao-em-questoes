export const LEGISBOT_MAX_BODY_BYTES = 1024;

const SLUG_PATTERN = /^[A-Z0-9_-]{1,50}$/;
const ORDER_PATTERN = /^[A-Za-z0-9._-]{1,20}$/;

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
  titulo: string;
  assunto: string;
  legislacao: string;
  promptLegislacao: string;
  sourceSignature: string;
};

export function normalizeLegisBotIdentifiers(slugValue: string, orderValue: string): LegisBotIdentifiers {
  const slug = slugValue.trim().toUpperCase();
  const ordem = orderValue.trim();
  if (!SLUG_PATTERN.test(slug) || !ORDER_PATTERN.test(ordem)) {
    throw new LegisBotRequestError(400, "Os identificadores do trecho são inválidos.", "invalid_input");
  }
  return { slug, ordem };
}

export async function assertLegisBotIdentifiersOnlyBody(request: Request): Promise<void> {
  const contentType = request.headers.get("content-type")?.toLowerCase() ?? "";
  if (!contentType.startsWith("application/json")) {
    throw new LegisBotRequestError(415, "Envie os dados em JSON.", "invalid_input");
  }

  const declaredLength = Number(request.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > LEGISBOT_MAX_BODY_BYTES) {
    throw new LegisBotRequestError(413, "O corpo da solicitação excede o limite permitido.", "body_too_large");
  }

  const bytes = new Uint8Array(await request.arrayBuffer());
  if (bytes.byteLength > LEGISBOT_MAX_BODY_BYTES) {
    throw new LegisBotRequestError(413, "O corpo da solicitação excede o limite permitido.", "body_too_large");
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
  if (Object.keys(record).length) {
    throw new LegisBotRequestError(400, "Envie somente os identificadores pela rota.", "invalid_input");
  }
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
