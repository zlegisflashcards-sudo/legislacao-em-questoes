import "server-only";

import { obterAdministrador } from "@/lib/admin-auth";
import { getSupabaseServerClient } from "@/lib/supabase-server";

const BUCKET = "legiscast-audio";
const MAX_BYTES = 100 * 1024 * 1024;
const allowed = new Map<string, string>([["mp3", "audio/mpeg"], ["m4a", "audio/mp4"]]);
export class AdminLegiscastAudioError extends Error { constructor(public status: number, message: string) { super(message); } }
function storageUploadFailure(path: string, file: File, storageContentType: string, error: { status?: number; statusCode?: string | number; message?: string; error?: string }) {
  const receivedStatus = Number(error.statusCode ?? error.status);
  console.error("LegisCast storage upload failed", {
    bucket: BUCKET,
    path,
    receivedMime: file.type || null,
    storageContentType,
    sizeBytes: file.size,
    status: Number.isFinite(receivedStatus) ? receivedStatus : null,
    message: error.message ?? null,
    error: error.error ?? null,
  });
  const status = [400, 401, 403, 404, 413, 415, 422].includes(receivedStatus) ? receivedStatus : 502;
  throw new AdminLegiscastAudioError(status, "Não foi possível enviar o áudio ao armazenamento privado.");
}
async function requireAdmin() { const admin = await obterAdministrador(); if (!admin) throw new AdminLegiscastAudioError(401, "Autenticação administrativa obrigatória."); return admin; }
function integer(value: FormDataEntryValue | null, fallback: number | null = null) { if (value === null || value === "") return fallback; const parsed = Number(value); if (!Number.isSafeInteger(parsed) || parsed < 0) throw new AdminLegiscastAudioError(400, "Número inválido."); return parsed; }

export async function listAdminLegiscastAudios() {
  await requireAdmin(); const db = getSupabaseServerClient();
  const [laws, audios] = await Promise.all([db.from("leis").select("id,slug,titulo").eq("ativo", true).order("titulo"), db.from("legiscast_audios").select("id,lei_id,titulo,descricao,duracao_segundos,ordem,ativo,created_at,leis(titulo,slug)").order("created_at", { ascending: false })]);
  if (laws.error || audios.error) throw new AdminLegiscastAudioError(503, "Não foi possível carregar os áudios do LegisCast.");
  return { laws: laws.data ?? [], audios: audios.data ?? [], maxBytes: MAX_BYTES };
}

export async function uploadAdminLegiscastAudio(form: FormData) {
  await requireAdmin(); const lawId = integer(form.get("lei_id")); const title = String(form.get("titulo") ?? "").trim(); const description = String(form.get("descricao") ?? "").trim() || null; const order = integer(form.get("ordem"), 0) ?? 0; const duration = integer(form.get("duracao_segundos")); const active = form.get("ativo") === "true"; const file = form.get("file");
  if (!lawId || !title) throw new AdminLegiscastAudioError(400, "Lei e título são obrigatórios.");
  if (!(file instanceof File) || !file.size) throw new AdminLegiscastAudioError(400, "Selecione um arquivo MP3 ou M4A.");
  if (file.size > MAX_BYTES) throw new AdminLegiscastAudioError(400, "O áudio deve ter no máximo 100 MB.");
  const extension = file.name.split(".").pop()?.toLowerCase() ?? ""; const contentType = allowed.get(extension);
  if (!contentType || (file.type && file.type !== contentType && !(extension === "m4a" && file.type === "audio/x-m4a"))) throw new AdminLegiscastAudioError(400, "Aceitamos somente arquivos MP3 ou M4A.");
  const db = getSupabaseServerClient(); const { data: law, error: lawError } = await db.from("leis").select("slug").eq("id", lawId).eq("ativo", true).maybeSingle();
  if (lawError || !law) throw new AdminLegiscastAudioError(400, "Lei inválida.");
  const path = `${law.slug}/${crypto.randomUUID()}.${extension}`;
  const upload = await db.storage.from(BUCKET).upload(path, await file.arrayBuffer(), { contentType, upsert: false });
  if (upload.error) storageUploadFailure(path, file, contentType, upload.error);
  const created = await db.from("legiscast_audios").insert({ lei_id: lawId, titulo: title, descricao: description, storage_path: path, duracao_segundos: duration, ordem: order, ativo: active }).select("id,titulo").single();
  if (created.error) { await db.storage.from(BUCKET).remove([path]); throw new AdminLegiscastAudioError(503, "Não foi possível vincular o áudio à lei."); }
  return { audio: created.data };
}
