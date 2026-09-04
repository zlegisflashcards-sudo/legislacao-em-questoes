import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { LEGISCAST_AUDIO_MAX_BYTES, formatLegiscastAudioSize } from "@/lib/legiscast-audio-upload";
import { LEGISCAST_FINAL_MAX_BYTES, LEGISCAST_ORIGINAL_MAX_BYTES, isAcceptedLegiscastOriginal } from "@/lib/legiscast-audio-processing";
import { legiscastPdfPositionKey, normalizeLegiscastPdfPage } from "@/lib/legiscast-pdf-position";

const migration = readFileSync("supabase/migrations/20260904123000_create_legiscast_audios.sql", "utf8");
const server = readFileSync("lib/legiscast-audios-server.ts", "utf8");
const player = readFileSync("components/legiscast-audio-player.tsx", "utf8");
const admin = readFileSync("lib/admin-legiscast-audios-server.ts", "utf8");
const adminClient = readFileSync("components/admin/legiscast-audios-admin.tsx", "utf8");
const adminRoute = readFileSync("app/api/admin/legiscast-audios/route.ts", "utf8");
const page = readFileSync("app/leis/[slug]/page.tsx", "utf8");
const lawLegiscastPage = readFileSync("app/estudar/lei/[slug]/legiscast/page.tsx", "utf8");
const lawLegiscastClient = readFileSync("components/law-legiscast-page-client.tsx", "utf8");
const pdfViewer = readFileSync("components/legiscast-pdf-viewer.tsx", "utf8");
const jobsMigration = readFileSync("supabase/migrations/20260904140000_create_legiscast_audio_jobs.sql", "utf8");
const worker = readFileSync("workers/legiscast-audio/src/index.mjs", "utf8");

describe("LegisCast em áudio", () => {
  it("mantém mídia fora do banco em bucket privado", () => {
    expect(migration).toContain("create table if not exists public.legiscast_audios");
    for (const field of ["lei_id", "titulo", "storage_path", "duracao_segundos", "ordem", "ativo", "created_at", "updated_at"]) expect(migration).toContain(field);
    expect(migration).toContain("'legiscast-audio'");
    expect(migration).toContain("false, 104857600");
    expect(migration).toContain("revoke all on table public.legiscast_audios");
  });

  it("emite URL temporária somente depois da autorização da lei", () => {
    expect(server).toContain("authorizeLawStudy(request, slug)");
    expect(server).toContain('createSignedUrl(audio.storage_path, 60 * 60)');
    expect(server).toContain('from(BUCKET)');
    expect(server).not.toContain("getPublicUrl");
  });

  it("oferece controles de áudio e playlist sem progresso de campanha", () => {
    for (const expected of ["↺ 15s", "15s ↻", "Velocidade", "const speeds = [0.75, 1, 1.25, 1.5, 2]", "Playlist do LegisCast", "legiscast-audio:${track.id}"]) expect(player).toContain(expected);
    for (const forbidden of ["score", "ranking", "campanha", "porcentagem"]) expect(player.toLowerCase()).not.toContain(forbidden);
    expect(page).not.toContain("LegiscastAudioPlayer");
    expect(lawLegiscastPage).toContain("LawLegiscastPageClient");
    for (const expected of ["LegiscastPdfViewer", "<LegiscastAudioPlayer slug={slug} embedded />", "StudentAreaTabs", "minhasLeisHref=\"/minhas-leis\"", "/api/aluno/estudar/lei/", "/conta?modo=login", "recorteId ? `?recorte_id="]) expect(lawLegiscastClient).toContain(expected);
    expect(player).toContain("embedded = false");
    expect(player).toContain("border-t border-slate-200 pt-6");
    expect(lawLegiscastPage).toContain("searchParams");
    expect(lawLegiscastPage).toContain("recorte_id");
  });

  it("envia somente o original ao Cloud Storage e mantém o limite do resultado", () => {
    expect(LEGISCAST_AUDIO_MAX_BYTES).toBe(50 * 1024 * 1024);
    expect(LEGISCAST_FINAL_MAX_BYTES).toBe(50 * 1024 * 1024);
    expect(LEGISCAST_ORIGINAL_MAX_BYTES).toBe(500 * 1024 * 1024);
    expect(formatLegiscastAudioSize(52660613)).toBe("50,2 MB");
    expect(isAcceptedLegiscastOriginal("voz.mp3", "audio/mpeg")).toBe(true);
    expect(isAcceptedLegiscastOriginal("voz.m4a", "audio/mp4")).toBe(true);
    expect(isAcceptedLegiscastOriginal("voz.m4a", "audio/x-m4a")).toBe(true);
    expect(isAcceptedLegiscastOriginal("voz.wav", "audio/wav")).toBe(true);
    expect(isAcceptedLegiscastOriginal("voz.wav", "audio/mp4")).toBe(false);
    for (const expected of ["authorizeAdminLegiscastOriginal", "confirmAdminLegiscastOriginal", "operationToken", "getLegiscastOriginalMetadata", "runLegiscastCloudRunJob"]) expect(admin).toContain(expected);
    for (const expected of ["operation: \"authorize-original\"", "operation: \"confirm-original\"", "uploadUrl", "method: \"PUT\""]) expect(adminClient).toContain(expected);
    expect(adminRoute).not.toContain("formData()");
  });

  it("mantém job atômico, idempotente e worker com parâmetros fixos", () => {
    for (const field of ["original_bucket", "original_path", "final_path", "final_size_bytes", "tentativas", "erro_codigo", "erro_mensagem"]) expect(jobsMigration).toContain(field);
    expect(jobsMigration).toContain("claim_legiscast_audio_job");
    expect(jobsMigration).toContain("status = 'pendente'");
    for (const expected of ["ffprobe", "-ac", "-c:a", "aac", "-b:a", "64k", "loudnorm", "+faststart", "FINAL_MAX_BYTES", "storage_path", "status: \"concluido\""]) expect(worker).toContain(expected);
    expect(worker).not.toContain("process.argv[3]");
  });

  it("persiste a página do PDF por lei e recorte somente no LegisCast", () => {
    expect(lawLegiscastClient).toContain("LegiscastPdfViewer");
    expect(legiscastPdfPositionKey("cdc", null)).toBe("legiscast-pdf-position:cdc:completo");
    expect(legiscastPdfPositionKey("cdc", "bc797e57-f4bc-4b2e-89d8-ee9594953b2a")).toBe("legiscast-pdf-position:cdc:bc797e57-f4bc-4b2e-89d8-ee9594953b2a");
    expect(normalizeLegiscastPdfPage(23, 30)).toBe(23);
    expect(normalizeLegiscastPdfPage(99, 30)).toBe(30);
    expect(normalizeLegiscastPdfPage(0, 30)).toBe(1);
    for (const expected of ["pdfjs-dist/legacy/build/pdf.mjs", "getOutline", "getPageIndex", "localStorage.setItem", "normalizeLegiscastPdfPage", "scrollIntoView", "Aumentar zoom"]) expect(pdfViewer).toContain(expected);
  });
});
