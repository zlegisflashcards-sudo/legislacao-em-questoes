import { createClient } from "@supabase/supabase-js";
import { Storage } from "@google-cloud/storage";
import { execFile } from "node:child_process";
import { mkdir, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const FINAL_MAX_BYTES = 50 * 1024 * 1024;
const jobId = process.argv[2];
const required = (name) => { const value = process.env[name]?.trim(); if (!value) throw new Error(`missing_${name}`); return value; };
const supabase = createClient(required("SUPABASE_URL"), required("SUPABASE_SERVICE_ROLE_KEY"), { auth: { autoRefreshToken: false, persistSession: false } });
const originals = new Storage().bucket(required("GCP_LEGISCAST_ORIGINAL_BUCKET"));

function safeMessage(error) { return error instanceof Error ? error.message.slice(0, 500) : "Erro técnico sem mensagem."; }
async function fail(id, code, error) { await supabase.from("legiscast_audio_jobs").update({ status: "erro", erro_codigo: code, erro_mensagem: safeMessage(error), finished_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("id", id).neq("status", "concluido"); }
async function probe(file) { const { stdout } = await execFileAsync("ffprobe", ["-v", "error", "-show_entries", "format=duration:stream=codec_type,codec_name", "-of", "json", file]); const result = JSON.parse(stdout); const audio = result.streams?.find((stream) => stream.codec_type === "audio"); const duration = Math.round(Number(result.format?.duration)); if (!audio || !Number.isFinite(duration) || duration < 1) throw new Error("invalid_audio"); return { duration, codec: audio.codec_name }; }

async function main() {
  if (!/^[0-9a-f-]{36}$/i.test(jobId ?? "")) throw new Error("invalid_job_id");
  const { data: claimed, error: claimError } = await supabase.rpc("claim_legiscast_audio_job", { p_job_id: jobId });
  if (claimError) throw claimError;
  const job = Array.isArray(claimed) ? claimed[0] : claimed;
  if (!job) return; // outro worker já assumiu, foi concluído ou esgotou tentativas
  const directory = join(tmpdir(), `legiscast-${job.id}`); const input = join(directory, "original"); const output = join(directory, "optimized.m4a");
  try {
    await mkdir(directory, { recursive: true });
    const [exists] = await originals.file(job.original_path).exists(); if (!exists) throw Object.assign(new Error("original_not_found"), { code: "original_not_found" });
    await originals.file(job.original_path).download({ destination: input });
    await probe(input);
    await execFileAsync("ffmpeg", ["-y", "-i", input, "-vn", "-map", "0:a:0", "-ac", "1", "-c:a", "aac", "-b:a", "64k", "-af", "loudnorm=I=-16:TP=-1.5:LRA=11", "-movflags", "+faststart", output], { maxBuffer: 1024 * 1024 });
    const outputProbe = await probe(output); if (outputProbe.codec !== "aac") throw new Error("invalid_final_codec"); const outputSize = (await stat(output)).size; if (outputSize > FINAL_MAX_BYTES) throw Object.assign(new Error("final_size_limit"), { code: "final_size_limit" });
    const { data: existing, error: existingError } = await supabase.from("legiscast_audios").select("id").eq("storage_path", job.final_path).maybeSingle(); if (existingError) throw existingError;
    if (!existing) {
      const file = await readFile(output);
      const upload = await supabase.storage.from("legiscast-audio").upload(job.final_path, file, { contentType: "audio/mp4", upsert: true }); if (upload.error) throw Object.assign(upload.error, { code: "supabase_upload_failed" });
      const insert = await supabase.from("legiscast_audios").insert({ lei_id: job.lei_id, titulo: job.titulo, descricao: job.descricao, storage_path: job.final_path, duracao_segundos: outputProbe.duration, ordem: job.ordem, ativo: job.ativo });
      if (insert.error) { await supabase.storage.from("legiscast-audio").remove([job.final_path]); throw Object.assign(insert.error, { code: "publish_failed" }); }
    }
    const complete = await supabase.from("legiscast_audio_jobs").update({ status: "concluido", final_mime: "audio/mp4", final_size_bytes: outputSize, duracao_segundos: outputProbe.duration, erro_codigo: null, erro_mensagem: null, finished_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("id", job.id).eq("status", "processando"); if (complete.error) throw complete.error;
    await originals.file(job.original_path).delete({ ignoreNotFound: true });
  } catch (error) { await fail(job.id, error?.code || (String(error?.message).includes("ffmpeg") ? "ffmpeg_failed" : "processing_failed"), error); }
  finally { await rm(directory, { recursive: true, force: true }); }
}

await main();
