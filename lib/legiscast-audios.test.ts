import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync("supabase/migrations/20260904123000_create_legiscast_audios.sql", "utf8");
const server = readFileSync("lib/legiscast-audios-server.ts", "utf8");
const player = readFileSync("components/legiscast-audio-player.tsx", "utf8");
const admin = readFileSync("lib/admin-legiscast-audios-server.ts", "utf8");
const page = readFileSync("app/leis/[slug]/page.tsx", "utf8");

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
    expect(page.indexOf("<LegiscastAudioPlayer")).toBeGreaterThan(page.indexOf("<LegislacaoEmbed"));
  });

  it("restringe o upload a MP3/M4A e orienta a otimização para voz", () => {
    expect(admin).toContain('[["mp3", "audio/mpeg"], ["m4a", "audio/mp4"]]');
    expect(admin).toContain("MAX_BYTES = 100 * 1024 * 1024");
    expect(admin).toContain("Aceitamos somente arquivos MP3 ou M4A.");
    for (const expected of ["LegisCast storage upload failed", "bucket: BUCKET", "receivedMime", "storageContentType", "sizeBytes"]) expect(admin).toContain(expected);
    for (const forbidden of ["SUPABASE_SERVICE_ROLE_KEY", "authorization", "cookie"]) expect(admin.toLowerCase()).not.toContain(forbidden.toLowerCase());
  });
});
