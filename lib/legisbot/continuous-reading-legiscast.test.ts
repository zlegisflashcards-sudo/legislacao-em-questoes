import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { attachConfirmedLegiscastAudioCoverage, resolveLegiscastTrackForStructure } from "@/lib/legiscast-audio-coverage-core";

const server = readFileSync("lib/legiscast-audios-server.ts", "utf8");
const route = readFileSync("app/api/legisbot/[slug]/legiscast/route.ts", "utf8");
const adminRoute = readFileSync("app/api/admin/legisbot/[slug]/legiscast/route.ts", "utf8");
const client = readFileSync("app/legisbot/[slug]/continuous-reading-client.tsx", "utf8");
const player = readFileSync("components/legiscast-audio-player.tsx", "utf8");
const adminStudentView = readFileSync("app/admin/artigos/legisbot-preview/visao-aluno/page.tsx", "utf8");

describe("Lei Interativa · áudio LegisCast", () => {
  const tracks = [
    { id: "direto", structureId: 10, active: true },
    { id: "cobertura", structureId: 4, active: true },
    { id: "nao-publicado", structureId: 11, active: false },
  ];

  it("prioriza a faixa direta e a cobertura editorial confirmada", () => {
    expect(resolveLegiscastTrackForStructure({ structureId: 10, tracks })).toMatchObject({ track: { id: "direto" }, source: "direct" });
    const attached = attachConfirmedLegiscastAudioCoverage(tracks, [{ audioId: "cobertura", structureId: 12 }]);
    expect(resolveLegiscastTrackForStructure({ structureId: 12, tracks: attached })).toMatchObject({ track: { id: "cobertura" }, source: "editorial" });
  });

  it("não presume cobertura, nem escolhe conflito ou faixa inativa", () => {
    expect(resolveLegiscastTrackForStructure({ structureId: 15, tracks })).toBeNull();
    expect(resolveLegiscastTrackForStructure({ structureId: 11, tracks })).toBeNull();
    expect(resolveLegiscastTrackForStructure({ structureId: 10, tracks: [...tracks, { id: "duplicada", structureId: 10, active: true }] })).toMatchObject({ pending: "ambiguous" });
  });

  it("protege a rota com autorização, lei, estrutura, publicação e assinatura única", () => {
    for (const expected of ["authorizeLawStudy(request, slug)", ".eq(\"lei_id\", context.lawId)", ".eq(\"ativo\", true)", "Estrutura não encontrada nesta legislação", "createSignedUrl(row.storage_path, 60 * 60)", "coverageMigrationPending", "audio_not_applicable"]) expect(server).toContain(expected);
    expect(route).toContain('"Cache-Control": "private, no-store, max-age=0"');
  });

  it("mantém estrutura visível e faixa em reprodução como estados distintos", () => {
    for (const expected of ["visibleStructureId", "playingAudio", "playingAudio ?? suggestedAudio", "onStart={(track) => setPlayingAudio", "LegiscastAudioTransport", "AbortController", "audioRequestRef", "audioLabel", "audioSwitch", "Usar áudio desta unidade", "hideTitle", "styles.srOnly", "playerCondensed", "updatePlayerDensity"]) expect(client).toContain(expected);
    expect(player).toContain("legiscast-audio:${track.id}");
    expect(player).toContain("LegiscastAudioTransport");
    expect(player).toContain("onStart?.(track)");
    expect(player).toContain("hideTitle = false");
  });

  it("preserva o fallback para lei sem estrutura e o modo global", () => {
    expect(client).toContain("visibleStructureId === null");
    expect(client).toContain("lawTitle");
    expect(client).toContain("!adminPreview");
  });

  it("permite conferência administrativa com o mesmo player, sem abrir a rota pública", () => {
    expect(adminRoute).toContain("obterAdministrador");
    expect(adminRoute).toContain("getLegiscastAudioForLaw");
    expect(adminRoute).toContain('"Cache-Control": "private, no-store, max-age=0"');
    expect(adminStudentView).toContain("studyUnits={model.studyUnits}");
    expect(adminStudentView).toContain("scopedReading");
    expect(adminStudentView).toContain("audioEndpoint={`/api/admin/legisbot/");
    expect(adminStudentView).not.toContain("adminPreview");
  });
});
