import "server-only";
import { timingSafeEqual } from "node:crypto";
import { obterAdministrador } from "@/lib/admin-auth";
import { validateLegisBotRequestOrigin } from "@/lib/legisbot/request-validation";

export class SalesHttpError extends Error {
  constructor(public readonly status: number, message: string) { super(message); }
}

export function privateJson(body: unknown, status = 200) {
  return Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

export function secretsEqual(a: string, b: string) {
  const left = Buffer.from(a); const right = Buffer.from(b);
  return left.length > 0 && left.length === right.length && timingSafeEqual(left, right);
}

export async function requireSalesAdmin(request: Request, mutation = false) {
  if (mutation) {
    try { validateLegisBotRequestOrigin(request); } catch { throw new SalesHttpError(403, "Origem não permitida."); }
    if (request.headers.get("sec-fetch-site") === "cross-site") throw new SalesHttpError(403, "Origem não permitida.");
  }
  const admin = await obterAdministrador();
  if (!admin) throw new SalesHttpError(401, "Entre com uma conta de administrador.");
  return admin;
}

export async function boundedBody(request: Request, limit: number): Promise<Buffer> {
  if (Number(request.headers.get("content-length")) > limit) throw new SalesHttpError(413, "Solicitação muito grande.");
  const reader = request.body?.getReader();
  if (!reader) return Buffer.alloc(0);
  const chunks: Uint8Array[] = []; let length = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > limit) { await reader.cancel(); throw new SalesHttpError(413, "Solicitação muito grande."); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  return Buffer.concat(chunks);
}

export async function readSalesJson(request: Request, limit = 24_000): Promise<Record<string, unknown>> {
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) throw new SalesHttpError(415, "Envie JSON.");
  let body: unknown;
  try { body = JSON.parse((await boundedBody(request, limit)).toString("utf8")); }
  catch (error) { if (error instanceof SalesHttpError) throw error; throw new SalesHttpError(400, "JSON inválido."); }
  if (!body || typeof body !== "object" || Array.isArray(body)) throw new SalesHttpError(400, "Dados inválidos.");
  return body as Record<string, unknown>;
}

export function salesError(error: unknown) {
  return error instanceof SalesHttpError
    ? privateJson({ error: error.message }, error.status)
    : privateJson({ error: "Não foi possível concluir. Verifique a configuração do LegisDot Comercial." }, 503);
}
