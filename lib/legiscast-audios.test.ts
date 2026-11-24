import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { LEGISCAST_AUDIO_MAX_BYTES, formatLegiscastAudioSize } from "@/lib/legiscast-audio-upload";
import { LEGISCAST_FINAL_MAX_BYTES, LEGISCAST_ORIGINAL_MAX_BYTES, isAcceptedLegiscastOriginal } from "@/lib/legiscast-audio-processing";
import { legiscastPdfPositionKey, normalizeLegiscastPdfPage } from "@/lib/legiscast-pdf-position";
import { legiscastAudioDisplayTitle } from "@/lib/legiscast-audio-title";

const migration = readFileSync("supabase/migrations/20260904123000_create_legiscast_audios.sql", "utf8");
const pdfPageMigration = readFileSync("supabase/migrations/20260911120000_add_law_structure_pdf_page.sql", "utf8");
const optionalTitleMigration = readFileSync("supabase/migrations/20260911150000_make_legiscast_audio_titles_optional.sql", "utf8");
const server = readFileSync("lib/legiscast-audios-server.ts", "utf8");
const player = readFileSync("components/legiscast-audio-player.tsx", "utf8");
const globalStyles = readFileSync("app/globals.css", "utf8");
const admin = readFileSync("lib/admin-legiscast-audios-server.ts", "utf8");
const adminClient = readFileSync("components/admin/legiscast-audios-admin.tsx", "utf8");
const adminRoute = readFileSync("app/api/admin/legiscast-audios/route.ts", "utf8");
const page = readFileSync("app/leis/[slug]/page.tsx", "utf8");
const lawLegiscastPage = readFileSync("app/estudar/lei/[slug]/legiscast/page.tsx", "utf8");
const interactiveLawClient = readFileSync("app/legisbot/[slug]/continuous-reading-client.tsx", "utf8");
const lawLegiscastClient = readFileSync("components/law-legiscast-page-client.tsx", "utf8");
const pdfViewer = readFileSync("components/legiscast-pdf-viewer.tsx", "utf8");
const jobsMigration = readFileSync("supabase/migrations/20260904140000_create_legiscast_audio_jobs.sql", "utf8");
const mp3Migration = readFileSync("supabase/migrations/20260924110000_add_legiscast_mp3_admin_download.sql", "utf8");
const mp3ReservationMigration = readFileSync("supabase/migrations/20260924123000_fix_legiscast_mp3_job_reservation.sql", "utf8");
const audioNotApplicableMigration = readFileSync("supabase/migrations/20261001123000_add_law_structure_audio_not_applicable.sql", "utf8");
const publicationDateMigration = readFileSync("supabase/migrations/20261014160000_add_legiscast_audio_publication_date.sql", "utf8");
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
    const standalone = server.slice(server.indexOf("export async function listAuthorizedLegiscastAudios"));
    const access = standalone.indexOf("await authorizeLawStudy(request, slug)");
    expect(access).toBeGreaterThan(-1);
    expect(standalone.indexOf('from("legiscast_audios")')).toBeGreaterThan(access);
    expect(standalone.indexOf("createSignedUrl")).toBeGreaterThan(access);
    expect(standalone).toContain("return { audios, structure, recorte: null, lawTitle: context.title }");
    expect(standalone).not.toContain("legislative_structure_releases");
  });

  it("oferece controles de áudio e playlist sem progresso de campanha", () => {
    for (const expected of ["↺ 15s", "15s ↻", "Velocidade", "const speeds = [0.75, 1, 1.25, 1.5, 2]", "Playlist do LegisCast", "legiscast-audio:${track.id}"]) expect(player).toContain(expected);
    for (const forbidden of ["score", "ranking", "campanha", "porcentagem"]) expect(player.toLowerCase()).not.toContain(forbidden);
    expect(page).not.toContain("LegiscastAudioPlayer");
    expect(lawLegiscastPage).toContain("LawLegiscastPageClient");
    for (const expected of ["<LegiscastAudioPlayer key={\`audio-${attempt}\`} slug={slug} embedded", "StudentAreaTabs", "minhasLeisHref=\"/minhas-leis\"", "/conta?modo=login"]) expect(lawLegiscastClient).toContain(expected);
    expect(player).toContain("embedded = false");
    expect(player).toContain("border-t border-slate-200 pt-6");
    expect(lawLegiscastPage).toContain("searchParams");
    expect(lawLegiscastPage).toContain("studyRecorteId");
  });

  it("usa título opcional como override e recorre ao nome da estrutura", () => {
    expect(legiscastAudioDisplayTitle("  Faixa especial  ", "Capítulo 01")).toBe("Faixa especial");
    expect(legiscastAudioDisplayTitle("", "Capítulo 01")).toBe("Capítulo 01");
    expect(legiscastAudioDisplayTitle(null, "Capítulo 01")).toBe("Capítulo 01");
    expect(legiscastAudioDisplayTitle("   ", "  Capítulo 01  ")).toBe("Capítulo 01");
    expect(legiscastAudioDisplayTitle(null, null)).toBe("Áudio");
    expect(server).toContain("legiscastAudioDisplayTitle(audio.titulo");
    expect(server).toContain("structureNames.get(audio.structure_id)");
  });

  it("aceita título vazio no admin, schema e publicação do worker", () => {
    expect(optionalTitleMigration).toContain("alter column titulo drop not null");
    expect(optionalTitleMigration).toContain("drop constraint if exists legiscast_audios_titulo_check");
    expect(optionalTitleMigration).toContain("drop constraint if exists legiscast_audio_jobs_titulo_check");
    expect(admin).toContain('const title = String(input.titulo ?? "").trim() || null');
    expect(admin).toContain('patch.titulo = String(input.titulo ?? "").trim() || null');
    expect(admin).not.toContain("Lei e título são obrigatórios.");
    expect(admin).not.toContain("Título obrigatório.");
    expect(adminClient).toContain("Opcional. Usa o nome do trecho se ficar vazio.");
    expect(adminClient).not.toContain('name="titulo" required');
    expect(worker).toContain("publish_legiscast_audio_job");
    expect(worker).not.toContain("job.titulo.trim");
  });

  it("carrega a hierarquia real da lei e renderiza título somente como agrupador visual", () => {
    expect(server).toContain('"id,titulo,descricao,duracao_segundos,ordem,storage_path,created_at,structure_id"');
    expect(server).toContain('from("law_structure")');
    expect(server).toContain("sortLegiscastAudiosByStructure");
    expect(server).toContain("titleGroupId: audio.titleGroupId");
    expect(player).toContain("buildLegiscastStructureTree");
    expect(player).toContain("tracksByStructure");
    expect(player).toContain("Sumário da lei");
    expect(player).toContain("overflow-y-auto");
    expect(player).toContain("legiscast-summary-scroll");
    expect(globalStyles).toContain(".legiscast-summary-scroll{scrollbar-gutter:stable;scrollbar-width:thin");
    expect(globalStyles).toContain(".legiscast-summary-scroll::-webkit-scrollbar-thumb");
    expect(globalStyles).toContain(".legiscast-summary-scroll{overflow-y:scroll}");
    expect(player).toContain("aria-current");
  });

  it("posiciona o sumário na estrutura recebida pela URL sem iniciar áudio automaticamente", () => {
    expect(player).toContain('useSearchParams');
    expect(player).toContain('searchParams.get("structure_id")');
    expect(player).toContain('id={`legiscast-structure-${node.id}`}');
    expect(player).toContain('data-target-structure={target ? "true" : undefined}');
    expect(player).toContain('scrollIntoView({ block: "center" })');
    expect(player).not.toContain('targetStructureId) void toggle');
  });

  it("aguarda apenas o catálogo de áudio autorizado, com feedback e nova tentativa", () => {
    expect(lawLegiscastClient).toContain("LegiscastSkeleton");
    expect(lawLegiscastClient).toContain("hidden={lawTitle === null}");
    expect(lawLegiscastClient).toContain("Tentar novamente");
    expect(lawLegiscastClient).toContain("onSessionRequired={redirectToLogin}");
    expect(lawLegiscastClient).not.toContain("fetch(");
    expect(lawLegiscastClient).not.toContain("LegiscastPdfViewer");
    expect(lawLegiscastClient).not.toContain("LegiscastPdfActions");
    expect(lawLegiscastClient).not.toContain("<LegiscastCommentedArticles");
    expect(player).toContain("/api/aluno/leis/${encodeURIComponent(slug)}/legiscast");
    expect(player).toContain("onReady?.(typeof body.lawTitle");
    expect(player).toContain("onError?.(");
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
    expect(isAcceptedLegiscastOriginal("aula.mp4", "video/mp4")).toBe(true);
    expect(isAcceptedLegiscastOriginal("aula.mp4", "video/quicktime")).toBe(false);
    for (const expected of ["authorizeAdminLegiscastOriginal", "confirmAdminLegiscastOriginal", "operationToken", "getLegiscastOriginalMetadata", "runLegiscastCloudRunJob"]) expect(admin).toContain(expected);
    for (const expected of ["operation: \"authorize-original\"", "operation: \"confirm-original\"", "uploadUrl", "method: \"PUT\"", "video/mp4", "Baixar áudio", "Baixar MP3", "download-mp3"]) expect(adminClient).toContain(expected);
    expect(adminRoute).not.toContain("formData()");
  });

  it("mantém job atômico, idempotente e worker com parâmetros fixos", () => {
    for (const field of ["original_bucket", "original_path", "final_path", "final_size_bytes", "tentativas", "erro_codigo", "erro_mensagem"]) expect(jobsMigration).toContain(field);
    expect(jobsMigration).toContain("claim_legiscast_audio_job");
    expect(jobsMigration).toContain("status = 'pendente'");
    for (const expected of ["ffprobe", "-ac", "-c:a", "aac", "-b:a", "64k", "loudnorm", "+faststart", "FINAL_MAX_BYTES", "publish_legiscast_audio_job", "processingToken"]) expect(worker).toContain(expected);
    expect(worker).not.toContain("process.argv[3]");
  });

  it("mantém downloads privados administrativos e gera MP3 apenas no worker", () => {
    for (const expected of ["downloadAdminLegiscastAudio", "downloadAdminLegiscastMp3", "createSignedUrl", "downloadFileName", "requireAdmin", "mp3_path"]) expect(admin).toContain(expected);
    for (const expected of ["libmp3lame", "audio/mpeg", "p_mp3_path", "uploadedPaths", "-map", "0:a:0"]) expect(worker).toContain(expected);
    for (const expected of ["add column if not exists mp3_path", "legiscast_audio_jobs_mp3_fields_check", "set search_path = ''", "revoke all on function", "to service_role"]) expect(mp3Migration).toContain(expected);
  });

  it("permite reservar o destino MP3 antes de o worker conhecer o tamanho final", () => {
    expect(admin).toContain("mp3_path: mp3Path");
    expect(admin).toContain('stage: "job_create"');
    expect(admin).toContain("logLegiscastJobCreationFailure(created.error, payload, id)");
    expect(admin).toContain("operationId");
    expect(mp3ReservationMigration).toContain("drop constraint if exists legiscast_audio_jobs_mp3_fields_check");
    expect(mp3ReservationMigration).toContain("mp3_size_bytes is null");
    expect(mp3ReservationMigration).toContain("mp3_size_bytes > 0");
  });

  it("preserva o componente separado de PDF e sua posição por lei e recorte", () => {
    expect(lawLegiscastClient).not.toContain("LegiscastPdfViewer");
    expect(legiscastPdfPositionKey("cdc", null)).toBe("legiscast-pdf-position:cdc:completo");
    expect(legiscastPdfPositionKey("cdc", "bc797e57-f4bc-4b2e-89d8-ee9594953b2a")).toBe("legiscast-pdf-position:cdc:bc797e57-f4bc-4b2e-89d8-ee9594953b2a");
    expect(normalizeLegiscastPdfPage(23, 30)).toBe(23);
    expect(normalizeLegiscastPdfPage(99, 30)).toBe(30);
    expect(normalizeLegiscastPdfPage(0, 30)).toBe(1);
    for (const expected of ["pdfjs-dist/legacy/build/pdf.mjs", "getOutline", "getPageIndex", "localStorage.setItem", "normalizeLegiscastPdfPage", "scrollIntoView", "Aumentar zoom"]) expect(pdfViewer).toContain(expected);
  });

  it("permite marcar manualmente que áudio não se aplica a um nó estrutural", () => {
    expect(audioNotApplicableMigration).toContain("add column if not exists audio_not_applicable boolean not null default false");
    expect(admin).toContain("updateAdminLegiscastStructureAudioNotApplicable");
    expect(admin).toContain('eq("lei_id", lawId)');
    expect(adminRoute).toContain('"update-structure-audio-not-applicable"');
    expect(adminClient).toContain("Áudio não se aplica");
    expect(adminClient).toContain("structure.audio_not_applicable");
    expect(adminClient).toContain("Sem áudio");
    expect(adminClient).toContain("Com áudio");
    expect(adminClient).toContain('audioStatus === "current" ? <span');
  });

  it("resume a cobertura por áudio, não aplicável e pendência em cada lei", () => {
    expect(adminClient).toContain("function legiscastCoverageForLaw");
    expect(adminClient).toContain("Cobertura do LegisCast");
    expect(adminClient).toContain("blocos cobertos por áudio ou dispensa");
    expect(adminClient).toContain("Faltam · {selectedCoverage.total");
    expect(adminClient).toContain("CoverageBar");
    expect(adminClient).toContain("lawTracks.filter((audio) => audio.structure_id === null)");
    expect(adminClient).toContain("total: 1");
  });

  it("separa cobertura, falta e áudio desatualizado pela alteração específica do bloco", () => {
    expect(admin).toContain("houve_alteracao_legislativa,ultima_alteracao_referencia,ultima_alteracao_data");
    expect(adminClient).toContain("latestBlockChange");
    expect(adminClient).toContain("function audioStatusForTracks");
    expect(adminClient).toContain("Desatualizados");
    expect(adminClient).toContain("Áudio desatualizado");
  });

  it("calcula duplicidades no servidor e as separa das sobreposições editoriais", () => {
    expect(admin).toContain("findLegiscastAudioConflicts");
    expect(admin).toContain("duplicateConflicts");
    expect(adminClient).toContain("Possível duplicidade");
    expect(adminClient).toContain("Sobreposição de cobertura");
    expect(adminClient).toContain("Com duplicidade");
    expect(adminClient).toContain("Nenhum áudio foi alterado.");
    expect(adminClient).toContain("setDeletingAudio(audio)");
    expect(adminClient).toContain("<DeleteAudioConfirmation");
    expect(adminClient).toContain('audioOperation("delete", deletingAudio.id)');
  });

  it("persiste a data da primeira postagem por faixa, sem confundi-la com edição", () => {
    expect(publicationDateMigration).toContain("add column if not exists publicado_em date");
    expect(publicationDateMigration).toContain("set publicado_em = created_at::date");
    expect(publicationDateMigration).toContain("CURRENT_DATE");
    expect(publicationDateMigration).toContain("create or replace function public.publish_legiscast_audio_job");
    expect(admin).toContain("storage_path,publicado_em,created_at,updated_at");
    expect(adminClient).toContain("publicado em");
    expect(adminClient).toContain("formatPublicationDate(audio.publicado_em)");
  });

  it("renderiza text layer e mantém download e impressão no fluxo autorizado", () => {
    expect(pdfViewer).toContain("getTextContent");
    expect(pdfViewer).toContain("new pdfjs.TextLayer");
    expect(pdfViewer).toContain("textLayer");
    expect(pdfViewer).toContain("authorizedPdfBlob");
    expect(pdfViewer).toContain("Baixar PDF");
    expect(pdfViewer).toContain("Imprimir");
    expect(pdfViewer).toContain("authorizedLegiscastPdfPath(slug, materialId, recorteId)");
    expect(pdfViewer).toContain("catch { textLayer.remove(); }");
  });

  it("não exibe o sumário antigo do PDF.js no LegisCast", () => {
    expect(pdfViewer).not.toContain("Sumário do PDF");
    expect(pdfViewer).not.toContain("<details");
    expect(pdfViewer).toContain("getOutline");
    expect(pdfViewer).toContain("getPageIndex");
    expect(player).toContain("Sumário da lei");
  });

  it("preserva páginas legadas fora do fluxo administrativo do LegisCast", () => {
    expect(pdfPageMigration).toContain("add column if not exists pdf_page integer");
    expect(pdfPageMigration).toContain("pdf_page is null or pdf_page >= 1");
    expect(admin).toContain("function positivePdfPage");
    expect(admin).toContain("Number.isSafeInteger(parsed)");
    expect(admin).toContain("parsed < 1");
    expect(admin).toContain("pdfPage = positivePdfPage(input.pdfPage)");
    expect(admin).toContain("update({ pdf_page: pdfPage");
    expect(adminRoute).toContain('body.operation === "update-structure-pdf-page"');
    expect(adminClient).not.toContain('name="pdf_page"');
    expect(adminClient).not.toContain("Página onde esta estrutura começa no PDF.");
    expect(adminClient).not.toContain('operation: "update-structure-pdf-page"');
    expect(adminClient).toContain("expandedAudioGroup");
    expect(adminClient).toContain("toggleAudioGroup");
    expect(adminClient).toContain('aria-expanded={expandedAudioGroup === groupId}');
    expect(adminClient).toContain("Ver áudio");
    expect(adminClient).toContain("Ocultar áudio");
  });

  it("preserva navegação do componente de PDF sem ativar links de página no LegisCast separado", () => {
    expect(server).toContain("id,parent_id,tipo,nome,ordem,pdf_page");
    expect(player).toContain("node.pdf_page");
    expect(player).toContain("onNavigateToPdfPage?.(navigablePage)");
    expect(player).toContain("track.order === 0");
    expect(player).toContain("playlistTracks.map((track)");
    expect(player).toContain("Ordem 0 preserva a faixa principal");
    expect(player).toContain("onNavigateToPdfPage && Number.isSafeInteger(node.pdf_page)");
    expect(lawLegiscastClient).not.toContain("onNavigateToPdfPage");
    expect(pdfViewer).toContain('canvas[data-page="${requestedPage}"]');
    expect(pdfViewer).toContain("legiscast_pdf_page_navigation_ignored");
    expect(pdfViewer).toContain("requestedPage > total");
    const viewerEffect = pdfViewer.slice(pdfViewer.indexOf('if (status !== "ready" || requestedPage'), pdfViewer.indexOf("[targetPage?.requestId, status, total"));
    expect(viewerEffect).not.toContain("setZoom");
    expect(viewerEffect).not.toContain("fetchAuthorizedLegiscastPdf");
    expect(player.match(/<audio /g)).toHaveLength(1);
  });

  it("usa a mesma coluna de capa, player e playlist em todas as telas", () => {
    const cover = lawLegiscastClient.indexOf("Capa dos hosts do LegisCast");
    const playerPosition = lawLegiscastClient.indexOf("<LegiscastAudioPlayer key=");
    expect(cover).toBeGreaterThan(-1);
    expect(playerPosition).toBeGreaterThan(cover);
    expect(lawLegiscastClient).toContain("w-[min(100%,220px)]");
    expect(lawLegiscastClient).toContain("max-w-2xl");
    expect(lawLegiscastClient).not.toMatch(/lg:|matchMedia/);
    expect(player).toContain("<StructureSummary");
    expect(player.indexOf('aria-label="Posição da reprodução"')).toBeLessThan(player.lastIndexOf("<StructureSummary"));
    const standalone = player.slice(player.indexOf("export function LegiscastAudioPlayer"));
    expect(standalone).not.toContain("lg:");
    for (const label of ["Reproduzir", "Voltar 15 segundos", "Avançar 15 segundos", "Velocidade"]) expect(standalone).toContain(label);
  });

  it("mantém PDF na Lei Interativa, sem ações de PDF no LegisCast separado", () => {
    expect(lawLegiscastClient).not.toMatch(/LegiscastPdf|pdfReady|Material em PDF/);
    expect(interactiveLawClient).toContain("<LegiscastPdfDownload");
    expect(interactiveLawClient).toContain("Baixar PDF esquematizado");
    expect(pdfViewer).toContain("export function LegiscastPdfActions");
    expect(pdfViewer).toContain("fetchAuthorizedLegiscastPdf(slug, materialId, recorteId)");
    for (const label of ["Baixar", "Imprimir", "Expandir"]) expect(pdfViewer).toContain(`>${label}</button>`);
  });
});
