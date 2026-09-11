import "server-only";

import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { obterAdministrador } from "@/lib/admin-auth";
import { createLegiscastOriginalUploadUrl, getLegiscastGcpAuthClient, getLegiscastOriginalBucketName, getLegiscastOriginalMetadata, runLegiscastCloudRunJob } from "@/lib/gcp-legiscast-originals-server";
import { LEGISCAST_MAX_ATTEMPTS, LEGISCAST_ORIGINAL_MAX_BYTES, LEGISCAST_ORIGINAL_UPLOAD_TTL_MS, extensionOfLegiscastAudio, isAcceptedLegiscastOriginal } from "@/lib/legiscast-audio-processing";
import { getSupabaseServerClient } from "@/lib/supabase-server";

type Operation = { jobId: string; originalPath: string; expiresAt: number };
type AuthorizeInput = { lawId: unknown; structureId?: unknown; titulo: unknown; descricao: unknown; ordem: unknown; ativo: unknown; fileName: unknown; mime: unknown; sizeBytes: unknown };
type ConfirmInput = { jobId: unknown; operationToken: unknown };
type RetryInput = { jobId: unknown };
type AudioInput = { audioId: unknown; titulo?: unknown; descricao?: unknown; ordem?: unknown; ativo?: unknown; structureId?: unknown };
type StructurePdfPageInput = { structureId: unknown; pdfPage?: unknown };

export class AdminLegiscastAudioError extends Error { constructor(public status: number, message: string) { super(message); } }
function safeAuthorizationErrorMessage(error: unknown) {
  const message = error instanceof Error ? error.message : String(error ?? "Erro técnico sem mensagem.");
  return message
    .replace(/Bearer\s+[^\s]+/gi, "Bearer [redacted]")
    .replace(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, "[redacted-jwt]")
    .replace(/([?&](?:access_token|token|signature|authorization)=)[^&\s]+/gi, "$1[redacted]")
    .slice(0, 500);
}
function logLegiscastUploadAuthorizationFailure(error: unknown) {
  const details = error && typeof error === "object" ? error as Record<string, unknown> : {};
  const response = details.response && typeof details.response === "object" ? details.response as Record<string, unknown> : {};
  const status = typeof details.code === "number" ? details.code : typeof response.status === "number" ? response.status : undefined;
  const code = typeof details.code === "string" ? details.code : undefined;
  console.error("legiscast_upload_authorization_failed", { errorName: error instanceof Error ? error.name : "UnknownError", message: safeAuthorizationErrorMessage(error), status, code });
}
async function requireAdmin() { if (!await obterAdministrador()) throw new AdminLegiscastAudioError(401, "Autenticação administrativa obrigatória."); }
function positiveInteger(value: unknown, optional = false) { if ((value === null || value === undefined || value === "") && optional) return null; const parsed = Number(value); if (!Number.isSafeInteger(parsed) || parsed < 0) throw new AdminLegiscastAudioError(400, "Número inválido."); return parsed; }
function positivePdfPage(value: unknown) { if (value === null || value === undefined || value === "") return null; const parsed = Number(value); if (!Number.isSafeInteger(parsed) || parsed < 1) throw new AdminLegiscastAudioError(400, "A página do PDF deve ser um número inteiro maior ou igual a 1."); return parsed; }
function signingKey() { const key = process.env.SUPABASE_SERVICE_ROLE_KEY; if (!key) throw new AdminLegiscastAudioError(500, "Configuração do servidor indisponível."); return key; }
function sign(value: string) { return createHmac("sha256", signingKey()).update(value).digest("base64url"); }
function createOperationToken(operation: Operation) { const payload = Buffer.from(JSON.stringify(operation)).toString("base64url"); return `${payload}.${sign(payload)}`; }
function readOperationToken(token: unknown) {
  const [payload, supplied, ...extra] = String(token ?? "").split("."); if (!payload || !supplied || extra.length) throw new AdminLegiscastAudioError(403, "Autorização de upload inválida.");
  const expected = sign(payload); if (supplied.length !== expected.length || !timingSafeEqual(Buffer.from(supplied), Buffer.from(expected))) throw new AdminLegiscastAudioError(403, "Autorização de upload inválida.");
  let operation: Operation; try { operation = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")); } catch { throw new AdminLegiscastAudioError(403, "Autorização de upload inválida."); }
  if (!/^[0-9a-f-]{36}$/i.test(operation.jobId) || typeof operation.originalPath !== "string" || operation.expiresAt <= Date.now()) throw new AdminLegiscastAudioError(403, "Autorização de upload expirada."); return operation;
}
async function activeLaw(lawId: number) { const db = getSupabaseServerClient(); const { data, error } = await db.from("leis").select("id,slug").eq("id", lawId).eq("ativo", true).maybeSingle(); if (error || !data) throw new AdminLegiscastAudioError(400, "Lei inválida."); return { db, law: data }; }
function fields(input: AuthorizeInput) {
  const lawId = positiveInteger(input.lawId) as number; const title = String(input.titulo ?? "").trim() || null; const description = String(input.descricao ?? "").trim() || null; const order = positiveInteger(input.ordem, true) ?? 0; const active = input.ativo !== false;
  const fileName = String(input.fileName ?? "").trim(); const mime = String(input.mime ?? "").trim().toLowerCase(); const sizeBytes = positiveInteger(input.sizeBytes) as number;
  if (!fileName || !isAcceptedLegiscastOriginal(fileName, mime)) throw new AdminLegiscastAudioError(400, "Aceitamos somente arquivos MP3, M4A ou WAV.");
  if (!sizeBytes) throw new AdminLegiscastAudioError(400, "Selecione um arquivo de áudio."); if (sizeBytes > LEGISCAST_ORIGINAL_MAX_BYTES) throw new AdminLegiscastAudioError(400, "O arquivo original deve ter no máximo 500 MB.");
  const structureId = positiveInteger(input.structureId, true); return { lawId, structureId, title, description, order, active, mime, sizeBytes, extension: extensionOfLegiscastAudio(fileName) };
}
function statusLabel(status: string) { return ({ pendente: "Na fila", processando: "Processando", concluido: "Concluído", erro: "Erro" } as Record<string, string>)[status] ?? status; }

export async function listAdminLegiscastAudios() {
  await requireAdmin(); const db = getSupabaseServerClient(); const [laws, audios, jobs] = await Promise.all([
    db.from("leis").select("id,slug,titulo").eq("ativo", true).order("titulo"), db.from("legiscast_audios").select("id,lei_id,structure_id,titulo,descricao,duracao_segundos,ordem,ativo,storage_path,created_at,updated_at,leis(titulo,slug)").order("created_at", { ascending: false }),
    db.from("legiscast_audio_jobs").select("id,lei_id,structure_id,titulo,status,original_size_bytes,final_size_bytes,duracao_segundos,erro_codigo,tentativas,created_at,leis(titulo,slug)").order("created_at", { ascending: false }).limit(30),
  ]);
  if (laws.error || audios.error || jobs.error) throw new AdminLegiscastAudioError(503, "Não foi possível carregar os áudios do LegisCast.");
  const structures = await db.from("law_structure").select("id,lei_id,parent_id,tipo,nome,ordem,pdf_page").eq("ativo", true).order("ordem"); if (structures.error) throw new AdminLegiscastAudioError(503, "Não foi possível carregar a estrutura das leis."); return { laws: laws.data ?? [], audios: audios.data ?? [], structures: structures.data ?? [], jobs: (jobs.data ?? []).map((job) => ({ ...job, statusLabel: statusLabel(job.status) })), originalMaxBytes: LEGISCAST_ORIGINAL_MAX_BYTES, finalMaxBytes: 50 * 1024 * 1024 };
}

export async function updateAdminLegiscastStructurePdfPage(input: StructurePdfPageInput) { await requireAdmin(); const structureId = positiveInteger(input.structureId) as number; const pdfPage = positivePdfPage(input.pdfPage); const db = getSupabaseServerClient(); const result = await db.from("law_structure").update({ pdf_page: pdfPage, updated_at: new Date().toISOString() }).eq("id", structureId).select("id").maybeSingle(); if (result.error) throw new AdminLegiscastAudioError(503, "Não foi possível atualizar a página da estrutura."); if (!result.data) throw new AdminLegiscastAudioError(404, "Estrutura não encontrada."); return { id: structureId, pdfPage }; }

export async function authorizeAdminLegiscastOriginal(input: AuthorizeInput) {
  await requireAdmin(); const payload = fields(input); const { db, law } = await activeLaw(payload.lawId); if (payload.structureId) { const structure = await db.from("law_structure").select("id").eq("id", payload.structureId).eq("lei_id", payload.lawId).maybeSingle(); if (structure.error || !structure.data) throw new AdminLegiscastAudioError(400, "Estrutura inválida para esta lei."); } const id = randomUUID(); const originalPath = `legiscast-audio-original/${id}/original.${payload.extension}`; const finalPath = `${law.slug}/${id}.m4a`;
  const created = await db.from("legiscast_audio_jobs").insert({ id, lei_id: payload.lawId, structure_id: payload.structureId, titulo: payload.title, descricao: payload.description, ordem: payload.order, ativo: payload.active, original_bucket: getLegiscastOriginalBucketName(), original_path: originalPath, original_mime: payload.mime, original_size_bytes: payload.sizeBytes, final_path: finalPath }).select("id").single();
  if (created.error) throw new AdminLegiscastAudioError(503, "Não foi possível criar o processamento do áudio.");
  try { const uploadUrl = await createLegiscastOriginalUploadUrl(originalPath, payload.mime, id); return { jobId: id, uploadUrl, originalPath, operationToken: createOperationToken({ jobId: id, originalPath, expiresAt: Date.now() + LEGISCAST_ORIGINAL_UPLOAD_TTL_MS }) }; }
  catch (error) { logLegiscastUploadAuthorizationFailure(error); await db.from("legiscast_audio_jobs").update({ status: "erro", erro_codigo: "upload_authorization_failed", erro_mensagem: safeAuthorizationErrorMessage(error), finished_at: new Date().toISOString() }).eq("id", id); throw new AdminLegiscastAudioError(502, "Não foi possível autorizar o envio do original."); }
}

export async function confirmAdminLegiscastOriginal(input: ConfirmInput) {
  await requireAdmin(); const jobId = String(input.jobId ?? ""); const operation = readOperationToken(input.operationToken); if (operation.jobId !== jobId) throw new AdminLegiscastAudioError(403, "Autorização de upload inválida."); const db = getSupabaseServerClient();
  const { data: job, error } = await db.from("legiscast_audio_jobs").select("id,status,original_bucket,original_path,original_mime,original_size_bytes").eq("id", jobId).maybeSingle();
  if (error || !job || job.original_path !== operation.originalPath || job.original_bucket !== getLegiscastOriginalBucketName()) throw new AdminLegiscastAudioError(404, "Processamento não encontrado."); if (job.status === "concluido" || job.status === "processando") return { jobId, status: job.status };
  let metadata: { size?: string | number | null; contentType?: string | null }; try { metadata = await getLegiscastOriginalMetadata(job.original_path, { auth: getLegiscastGcpAuthClient(), bucket: job.original_bucket, jobId }); } catch { throw new AdminLegiscastAudioError(400, "O arquivo original não foi encontrado no armazenamento temporário."); }
  const size = Number(metadata.size); const mime = String(metadata.contentType ?? "").toLowerCase();
  if (!Number.isSafeInteger(size) || size < 1 || size > LEGISCAST_ORIGINAL_MAX_BYTES || size !== Number(job.original_size_bytes) || mime !== job.original_mime) { await db.from("legiscast_audio_jobs").update({ status: "erro", erro_codigo: "invalid_original", erro_mensagem: "Metadados do arquivo original não conferem.", finished_at: new Date().toISOString() }).eq("id", jobId); throw new AdminLegiscastAudioError(400, "O arquivo enviado não passou na validação."); }
  await db.from("legiscast_audio_jobs").update({ status: "pendente", updated_at: new Date().toISOString() }).eq("id", jobId).in("status", ["pendente", "erro"]);
  try { await runLegiscastCloudRunJob(jobId); } catch (error) { await db.from("legiscast_audio_jobs").update({ status: "erro", erro_codigo: "dispatch_failed", erro_mensagem: error instanceof Error ? error.message.slice(0, 500) : "Falha ao iniciar worker.", finished_at: new Date().toISOString() }).eq("id", jobId); throw new AdminLegiscastAudioError(502, "O original foi enviado, mas não foi possível iniciar o processamento."); }
  return { jobId, status: "pendente" };
}

export async function retryAdminLegiscastAudioJob(input: RetryInput) {
  await requireAdmin(); const jobId = String(input.jobId ?? ""); const db = getSupabaseServerClient(); const { data: job, error } = await db.from("legiscast_audio_jobs").select("id,status,tentativas").eq("id", jobId).maybeSingle();
  if (error || !job) throw new AdminLegiscastAudioError(404, "Processamento não encontrado."); if (job.status === "concluido") return { jobId, status: "concluido" }; if (job.status !== "erro" || job.tentativas >= LEGISCAST_MAX_ATTEMPTS) throw new AdminLegiscastAudioError(400, "Este processamento não pode mais ser repetido.");
  await db.from("legiscast_audio_jobs").update({ status: "pendente", erro_codigo: null, erro_mensagem: null, finished_at: null, updated_at: new Date().toISOString() }).eq("id", jobId).eq("status", "erro");
  try { await runLegiscastCloudRunJob(jobId); } catch { await db.from("legiscast_audio_jobs").update({ status: "erro", erro_codigo: "dispatch_failed", erro_mensagem: "Falha ao iniciar worker.", finished_at: new Date().toISOString() }).eq("id", jobId); throw new AdminLegiscastAudioError(502, "Não foi possível iniciar nova tentativa."); }
  return { jobId, status: "pendente" };
}

async function audioForAdmin(audioId: unknown) { const id = String(audioId ?? ""); if (!/^[0-9a-f-]{36}$/i.test(id)) throw new AdminLegiscastAudioError(400, "Áudio inválido."); const db = getSupabaseServerClient(); const result = await db.from("legiscast_audios").select("id,lei_id,storage_path").eq("id", id).maybeSingle(); if (result.error || !result.data) throw new AdminLegiscastAudioError(404, "Áudio não encontrado."); return { db, audio: result.data }; }
export async function updateAdminLegiscastAudio(input: AudioInput) { await requireAdmin(); const { db, audio } = await audioForAdmin(input.audioId); const patch: Record<string, unknown> = {}; if (input.titulo !== undefined) patch.titulo = String(input.titulo ?? "").trim() || null; if (input.descricao !== undefined) patch.descricao = String(input.descricao).trim() || null; if (input.ordem !== undefined) patch.ordem = positiveInteger(input.ordem); if (input.ativo !== undefined) patch.ativo = input.ativo === true; if (input.structureId !== undefined) { const structureId = positiveInteger(input.structureId, true); if (structureId) { const structure = await db.from("law_structure").select("id").eq("id", structureId).eq("lei_id", audio.lei_id).maybeSingle(); if (structure.error || !structure.data) throw new AdminLegiscastAudioError(400, "Estrutura inválida para esta lei."); } patch.structure_id = structureId; } patch.updated_at = new Date().toISOString(); const result = await db.from("legiscast_audios").update(patch).eq("id", audio.id); if (result.error) throw new AdminLegiscastAudioError(503, "Não foi possível atualizar o áudio."); return { id: audio.id }; }
export async function previewAdminLegiscastAudio(input: AudioInput) { await requireAdmin(); const { db, audio } = await audioForAdmin(input.audioId); const signed = await db.storage.from("legiscast-audio").createSignedUrl(audio.storage_path, 600); if (signed.error || !signed.data?.signedUrl) throw new AdminLegiscastAudioError(503, "Não foi possível criar a prévia."); return { url: signed.data.signedUrl }; }
export async function deleteAdminLegiscastAudio(input: AudioInput) { await requireAdmin(); const { db, audio } = await audioForAdmin(input.audioId); const removed = await db.storage.from("legiscast-audio").remove([audio.storage_path]); if (removed.error) throw new AdminLegiscastAudioError(503, "Não foi possível remover o arquivo do áudio."); const deleted = await db.from("legiscast_audios").delete().eq("id", audio.id); if (deleted.error) throw new AdminLegiscastAudioError(503, "Arquivo removido, mas o registro não pôde ser excluído."); return { id: audio.id }; }
