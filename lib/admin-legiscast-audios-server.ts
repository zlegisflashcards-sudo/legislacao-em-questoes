import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";
import { obterAdministrador } from "@/lib/admin-auth";
import { getSupabaseServerClient } from "@/lib/supabase-server";

const BUCKET = "legiscast-audio";
const MAX_BYTES = 100 * 1024 * 1024;
const allowed = new Map<string, string>([["mp3", "audio/mpeg"], ["m4a", "audio/mp4"]]);
type Operation = { lawId: number; path: string; expiresAt: number };
type UploadInput = { lawId: unknown; fileName: unknown; mime: unknown; sizeBytes: unknown };
type FinalizeInput = { lawId: unknown; path: unknown; operationToken: unknown; titulo: unknown; descricao: unknown; ordem: unknown; duracaoSegundos: unknown; ativo: unknown };

export class AdminLegiscastAudioError extends Error { constructor(public status: number, message: string) { super(message); } }

async function requireAdmin() { const admin = await obterAdministrador(); if (!admin) throw new AdminLegiscastAudioError(401, "Autenticação administrativa obrigatória."); }
function positiveInteger(value: unknown, optional = false) { if ((value === null || value === undefined || value === "") && optional) return null; const parsed = Number(value); if (!Number.isSafeInteger(parsed) || parsed < 0) throw new AdminLegiscastAudioError(400, "Número inválido."); return parsed; }
function extensionOf(fileName: string) { return fileName.split(".").pop()?.toLowerCase() ?? ""; }
function validateUpload(input: UploadInput) { const lawId = positiveInteger(input.lawId) as number; const fileName = String(input.fileName ?? "").trim(); const mime = String(input.mime ?? "").toLowerCase(); const sizeBytes = positiveInteger(input.sizeBytes) as number; const extension = extensionOf(fileName); const storageContentType = allowed.get(extension); if (!fileName || !storageContentType || !mime || (mime !== storageContentType && !(extension === "m4a" && mime === "audio/x-m4a"))) throw new AdminLegiscastAudioError(400, "Aceitamos somente arquivos MP3 ou M4A."); if (!sizeBytes) throw new AdminLegiscastAudioError(400, "Selecione um arquivo MP3 ou M4A."); if (sizeBytes > MAX_BYTES) throw new AdminLegiscastAudioError(400, "O áudio deve ter no máximo 100 MB."); return { lawId, extension }; }
function signingKey() { const key = process.env.SUPABASE_SERVICE_ROLE_KEY; if (!key) throw new AdminLegiscastAudioError(500, "Configuração do servidor indisponível."); return key; }
function sign(value: string) { return createHmac("sha256", signingKey()).update(value).digest("base64url"); }
function createOperationToken(operation: Operation) { const payload = Buffer.from(JSON.stringify(operation)).toString("base64url"); return `${payload}.${sign(payload)}`; }
function readOperationToken(token: unknown) { const [payload, suppliedSignature, ...extra] = String(token ?? "").split("."); if (!payload || !suppliedSignature || extra.length) throw new AdminLegiscastAudioError(403, "Autorização de upload inválida."); const expectedSignature = sign(payload); if (suppliedSignature.length !== expectedSignature.length || !timingSafeEqual(Buffer.from(suppliedSignature), Buffer.from(expectedSignature))) throw new AdminLegiscastAudioError(403, "Autorização de upload inválida."); let operation: Operation; try { operation = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")); } catch { throw new AdminLegiscastAudioError(403, "Autorização de upload inválida."); } if (!Number.isSafeInteger(operation.lawId) || typeof operation.path !== "string" || !Number.isFinite(operation.expiresAt) || operation.expiresAt <= Date.now()) throw new AdminLegiscastAudioError(403, "Autorização de upload expirada."); return operation; }
async function activeLaw(lawId: number) { const db = getSupabaseServerClient(); const { data, error } = await db.from("leis").select("slug").eq("id", lawId).eq("ativo", true).maybeSingle(); if (error || !data) throw new AdminLegiscastAudioError(400, "Lei inválida."); return { db, law: data }; }

export async function listAdminLegiscastAudios() {
  await requireAdmin(); const db = getSupabaseServerClient();
  const [laws, audios] = await Promise.all([db.from("leis").select("id,slug,titulo").eq("ativo", true).order("titulo"), db.from("legiscast_audios").select("id,lei_id,titulo,descricao,duracao_segundos,ordem,ativo,created_at,leis(titulo,slug)").order("created_at", { ascending: false })]);
  if (laws.error || audios.error) throw new AdminLegiscastAudioError(503, "Não foi possível carregar os áudios do LegisCast.");
  return { laws: laws.data ?? [], audios: audios.data ?? [], maxBytes: MAX_BYTES };
}

export async function authorizeAdminLegiscastUpload(input: UploadInput) {
  await requireAdmin(); const { lawId, extension } = validateUpload(input); const { db, law } = await activeLaw(lawId); const path = `${law.slug}/${crypto.randomUUID()}.${extension}`; const { data, error } = await db.storage.from(BUCKET).createSignedUploadUrl(path);
  if (error || !data?.token) throw new AdminLegiscastAudioError(502, "Não foi possível autorizar o envio do áudio.");
  return { path, uploadToken: data.token, operationToken: createOperationToken({ lawId, path, expiresAt: Date.now() + 15 * 60 * 1000 }) };
}

export async function finalizeAdminLegiscastUpload(input: FinalizeInput) {
  await requireAdmin(); const lawId = positiveInteger(input.lawId) as number; const path = String(input.path ?? ""); const operation = readOperationToken(input.operationToken); if (operation.lawId !== lawId || operation.path !== path) throw new AdminLegiscastAudioError(403, "Autorização de upload inválida."); const title = String(input.titulo ?? "").trim(); const description = String(input.descricao ?? "").trim() || null; const order = positiveInteger(input.ordem, true) ?? 0; const duration = positiveInteger(input.duracaoSegundos, true); const active = input.ativo === true; if (!title) throw new AdminLegiscastAudioError(400, "Lei e título são obrigatórios."); const extension = extensionOf(path); if (!allowed.has(extension)) throw new AdminLegiscastAudioError(400, "Arquivo de áudio inválido."); const { db, law } = await activeLaw(lawId); const escapedSlug = law.slug.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); if (!new RegExp(`^${escapedSlug}/[0-9a-f-]{36}\\.(mp3|m4a)$`).test(path)) throw new AdminLegiscastAudioError(403, "Caminho de upload inválido."); const slash = path.lastIndexOf("/"); const filename = path.slice(slash + 1); const { data: objects, error: objectError } = await db.storage.from(BUCKET).list(path.slice(0, slash), { search: filename }); if (objectError || !objects?.some((object) => object.name === filename)) throw new AdminLegiscastAudioError(400, "O arquivo enviado não foi encontrado."); const existing = await db.from("legiscast_audios").select("id,titulo").eq("storage_path", path).maybeSingle(); if (existing.data) return { audio: existing.data }; const created = await db.from("legiscast_audios").insert({ lei_id: lawId, titulo: title, descricao: description, storage_path: path, duracao_segundos: duration, ordem: order, ativo: active }).select("id,titulo").single(); if (created.error) { await db.storage.from(BUCKET).remove([path]); throw new AdminLegiscastAudioError(503, "Não foi possível vincular o áudio à lei."); }
  return { audio: created.data };
}
