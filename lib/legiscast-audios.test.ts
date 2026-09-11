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
    expect(adminClient).toContain("Opcional. Se ficar vazio, será usado o nome da estrutura vinculada.");
    expect(adminClient).not.toContain('name="titulo" required');
    expect(worker).toContain("titulo: job.titulo");
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
    expect(player).toContain("aria-current");
  });

  it("coordena lei, PDF e áudio antes de revelar o LegisCast", () => {
    const client = readFileSync("components/law-legiscast-page-client.tsx", "utf8");
    const pdf = readFileSync("components/legiscast-pdf-viewer.tsx", "utf8");
    expect(client).toContain("const pageReady = mobileLayout !== null && audioReady && (mobileLayout || pdfReady)");
    expect(client).toContain("LegiscastSkeleton");
    expect(client).toContain('pageReady ? "" : "invisible"');
    expect(client).toContain("<LegiscastCommentedArticles");
    expect(client).toContain("!pageReady ? <div");
    expect(client).toContain("Tentar novamente");
    expect(client).not.toContain("setTimeout");
    expect(player).toContain("onReady?.()");
    expect(player).toContain("onError?.(");
    expect(pdf).toContain("if (status === \"ready\") onReady?.()");
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

  it("adiciona e administra a página inicial opcional de cada estrutura", () => {
    expect(pdfPageMigration).toContain("add column if not exists pdf_page integer");
    expect(pdfPageMigration).toContain("pdf_page is null or pdf_page >= 1");
    expect(admin).toContain("function positivePdfPage");
    expect(admin).toContain("Number.isSafeInteger(parsed)");
    expect(admin).toContain("parsed < 1");
    expect(admin).toContain("pdfPage = positivePdfPage(input.pdfPage)");
    expect(admin).toContain("update({ pdf_page: pdfPage");
    expect(adminRoute).toContain('body.operation === "update-structure-pdf-page"');
    expect(adminClient).toContain('name="pdf_page" type="number" min="1" step="1"');
    expect(adminClient).toContain('rawPage || null');
    expect(adminClient).toContain('Number(rawPage) < 1');
    expect(adminClient).toContain("Página onde esta estrutura começa no PDF.");
    expect(adminClient).toContain("Sem faixas vinculadas.");
  });

  it("navega do sumário estrutural para o PDF sem recarregar áudio ou documento", () => {
    expect(server).toContain("id,parent_id,tipo,nome,ordem,pdf_page");
    expect(player).toContain("node.pdf_page");
    expect(player).toContain("onNavigateToPdfPage?.(navigablePage)");
    expect(player).toContain("first || navigablePage !== null");
    expect(lawLegiscastClient).toContain("onNavigateToPdfPage={setTargetPdfPage}");
    expect(lawLegiscastClient.match(/targetPage=\{targetPdfPage\}/g)).toHaveLength(2);
    expect(pdfViewer).toContain('canvas[data-page="${targetPage}"]');
    expect(pdfViewer).toContain("legiscast_pdf_page_navigation_ignored");
    expect(pdfViewer).toContain("targetPage > total");
    const viewerEffect = pdfViewer.slice(pdfViewer.indexOf('if (status !== "ready" || targetPage'), pdfViewer.indexOf("[targetPage, status, total"));
    expect(viewerEffect).not.toContain("setZoom");
    expect(viewerEffect).not.toContain("fetchAuthorizedLegiscastPdf");
    expect(player.match(/<audio /g)).toHaveLength(1);
  });

  it("mantém no mobile capa, player, playlist, ações do PDF e artigos nessa ordem", () => {
    const cover = lawLegiscastClient.indexOf("Capa dos hosts do LegisCast");
    const actions = lawLegiscastClient.indexOf("<LegiscastPdfActions");
    const playerPosition = lawLegiscastClient.indexOf("<LegiscastAudioPlayer key=");
    const articles = lawLegiscastClient.indexOf("<LegiscastCommentedArticles");
    expect(cover).toBeGreaterThan(-1);
    expect(playerPosition).toBeGreaterThan(cover);
    expect(actions).toBeGreaterThan(playerPosition);
    expect(articles).toBeGreaterThan(actions);
    expect(player).toContain("<StructureSummary");
    expect(player.indexOf('aria-label="Posição da reprodução"')).toBeLessThan(player.indexOf("<StructureSummary"));
  });

  it("abre o PDF autorizado em modal mobile sem desmontar o player", () => {
    expect(lawLegiscastClient).toContain("mobilePdfOpen && pdf");
    expect(lawLegiscastClient).toContain('role="dialog" aria-modal="true"');
    expect(lawLegiscastClient).toContain('aria-label="Fechar PDF"');
    expect(lawLegiscastClient).toContain("setMobilePdfOpen(false)");
    expect(pdfViewer).toContain("export function LegiscastPdfActions");
    expect(pdfViewer).toContain("fetchAuthorizedLegiscastPdf(slug, materialId, recorteId)");
  });

  it("usa capa e controles compactos no mobile sem alterar os rótulos desktop", () => {
    expect(lawLegiscastClient).toContain("w-[min(100%,220px)]");
    expect(lawLegiscastClient).toContain("mx-auto aspect-square");
    expect(player).toContain('aria-label={playing ? "Pausar" : "Reproduzir"}');
    expect(player).toContain('{playing ? "⏸" : "▶"}');
    expect(player).toContain('aria-label="Voltar 15 segundos"');
    expect(player).toContain('aria-label="Avançar 15 segundos"');
    expect(player).toContain('className="hidden lg:inline">{playing ? "Pausar" : "Reproduzir"}');
    expect(player).not.toContain("overflow-x-auto");
  });

  it("separa as ações mobile em um cabeçalho de PDF sem viewer embutido", () => {
    expect(lawLegiscastClient).toContain('aria-labelledby="mobile-pdf-title"');
    expect(lawLegiscastClient).toContain('src="/icons/pdf.png"');
    expect(lawLegiscastClient).toContain("Material em PDF");
    expect(lawLegiscastClient).toContain("Acesse a legislação esquematizada desta lei.");
    expect(pdfViewer).toContain(">Baixar</button>");
    expect(pdfViewer).toContain(">Imprimir</button>");
    expect(pdfViewer).toContain(">Expandir</button>");
    expect(lawLegiscastClient).toContain("mobileLayout === false ? (pdf ? <LegiscastPdfViewer");
  });
});
