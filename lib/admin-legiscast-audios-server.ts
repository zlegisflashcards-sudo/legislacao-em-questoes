import "server-only";

import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { obterAdministrador } from "@/lib/admin-auth";
import { createLegiscastOriginalUploadUrl, getLegiscastOriginalBucketName, getLegiscastOriginalMetadata, runLegiscastCloudRunJob } from "@/lib/gcp-legiscast-originals-server";
import { LEGISCAST_MAX_ATTEMPTS, LEGISCAST_ORIGINAL_MAX_BYTES, LEGISCAST_ORIGINAL_UPLOAD_TTL_MS, extensionOfLegiscastAudio, isAcceptedLegiscastOriginal } from "@/lib/legiscast-audio-processing";
import { getSupabaseServerClient } from "@/lib/supabase-server";

type Operation = { jobId: string; originalPath: string; expiresAt: number };
type AuthorizeInput = { lawId: unknown; titulo: unknown; descricao: unknown; ordem: unknown; ativo: unknown; fileName: unknown; mime: unknown; sizeBytes: unknown };
type ConfirmInput = { jobId: unknown; operationToken: unknown };
type RetryInput = { jobId: unknown };

export class AdminLegiscastAudioError extends Error { constructor(public status: number, message: string) { super(message); } }
async function requireAdmin() { if (!await obterAdministrador()) throw new AdminLegiscastAudioError(401, "Autenticação administrativa obrigatória."); }
function positiveInteger(value: unknown, optional = false) { if ((value === null || value === undefined || value === "") && optional) return null; const parsed = Number(value); if (!Number.isSafeInteger(parsed) || parsed < 0) throw new AdminLegiscastAudioError(400, "Número inválido."); return parsed; }
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
  const lawId = positiveInteger(input.lawId) as number; const title = String(input.titulo ?? "").trim(); const description = String(input.descricao ?? "").trim() || null; const order = positiveInteger(input.ordem, true) ?? 0; const active = input.ativo !== false;
  const fileName = String(input.fileName ?? "").trim(); const mime = String(input.mime ?? "").trim().toLowerCase(); const sizeBytes = positiveInteger(input.sizeBytes) as number;
  if (!title) throw new AdminLegiscastAudioError(400, "Lei e título são obrigatórios."); if (!fileName || !isAcceptedLegiscastOriginal(fileName, mime)) throw new AdminLegiscastAudioError(400, "Aceitamos somente arquivos MP3, M4A ou WAV.");
  if (!sizeBytes) throw new AdminLegiscastAudioError(400, "Selecione um arquivo de áudio."); if (sizeBytes > LEGISCAST_ORIGINAL_MAX_BYTES) throw new AdminLegiscastAudioError(400, "O arquivo original deve ter no máximo 500 MB.");
  return { lawId, title, description, order, active, mime, sizeBytes, extension: extensionOfLegiscastAudio(fileName) };
}
function statusLabel(status: string) { return ({ pendente: "Na fila", processando: "Processando", concluido: "Concluído", erro: "Erro" } as Record<string, string>)[status] ?? status; }

export async function listAdminLegiscastAudios() {
  await requireAdmin(); const db = getSupabaseServerClient(); const [laws, audios, jobs] = await Promise.all([
    db.from("leis").select("id,slug,titulo").eq("ativo", true).order("titulo"), db.from("legiscast_audios").select("id,lei_id,titulo,descricao,duracao_segundos,ordem,ativo,created_at,leis(titulo,slug)").order("created_at", { ascending: false }),
    db.from("legiscast_audio_jobs").select("id,lei_id,titulo,status,original_size_bytes,final_size_bytes,duracao_segundos,erro_codigo,tentativas,created_at,leis(titulo,slug)").order("created_at", { ascending: false }).limit(30),
  ]);
  if (laws.error || audios.error || jobs.error) throw new AdminLegiscastAudioError(503, "Não foi possível carregar os áudios do LegisCast.");
  return { laws: laws.data ?? [], audios: audios.data ?? [], jobs: (jobs.data ?? []).map((job) => ({ ...job, statusLabel: statusLabel(job.status) })), originalMaxBytes: LEGISCAST_ORIGINAL_MAX_BYTES, finalMaxBytes: 50 * 1024 * 1024 };
}

export async function authorizeAdminLegiscastOriginal(input: AuthorizeInput) {
  await requireAdmin(); const payload = fields(input); const { db, law } = await activeLaw(payload.lawId); const id = randomUUID(); const originalPath = `legiscast-audio-original/${id}/original.${payload.extension}`; const finalPath = `${law.slug}/${id}.m4a`;
  const created = await db.from("legiscast_audio_jobs").insert({ id, lei_id: payload.lawId, titulo: payload.title, descricao: payload.description, ordem: payload.order, ativo: payload.active, original_bucket: getLegiscastOriginalBucketName(), original_path: originalPath, original_mime: payload.mime, original_size_bytes: payload.sizeBytes, final_path: finalPath }).select("id").single();
  if (created.error) throw new AdminLegiscastAudioError(503, "Não foi possível criar o processamento do áudio.");
  try { const uploadUrl = await createLegiscastOriginalUploadUrl(originalPath, payload.mime); return { jobId: id, uploadUrl, originalPath, operationToken: createOperationToken({ jobId: id, originalPath, expiresAt: Date.now() + LEGISCAST_ORIGINAL_UPLOAD_TTL_MS }) }; }
  catch (error) { await db.from("legiscast_audio_jobs").update({ status: "erro", erro_codigo: "upload_authorization_failed", erro_mensagem: error instanceof Error ? error.message.slice(0, 500) : "Falha ao autorizar upload.", finished_at: new Date().toISOString() }).eq("id", id); throw new AdminLegiscastAudioError(502, "Não foi possível autorizar o envio do original."); }
}

export async function confirmAdminLegiscastOriginal(input: ConfirmInput) {
  await requireAdmin(); const jobId = String(input.jobId ?? ""); const operation = readOperationToken(input.operationToken); if (operation.jobId !== jobId) throw new AdminLegiscastAudioError(403, "Autorização de upload inválida."); const db = getSupabaseServerClient();
  const { data: job, error } = await db.from("legiscast_audio_jobs").select("id,status,original_bucket,original_path,original_mime,original_size_bytes").eq("id", jobId).maybeSingle();
  if (error || !job || job.original_path !== operation.originalPath || job.original_bucket !== getLegiscastOriginalBucketName()) throw new AdminLegiscastAudioError(404, "Processamento não encontrado."); if (job.status === "concluido" || job.status === "processando") return { jobId, status: job.status };
  let metadata: { size?: string | number | null; contentType?: string | null }; try { metadata = await getLegiscastOriginalMetadata(job.original_path); } catch { throw new AdminLegiscastAudioError(400, "O arquivo original não foi encontrado no armazenamento temporário."); }
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
