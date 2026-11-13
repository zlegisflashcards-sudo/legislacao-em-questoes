import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync("supabase/migrations/20261112225117_add_legiscast_audio_structure_coverage.sql", "utf8");
const server = readFileSync("lib/admin-legiscast-audios-server.ts", "utf8");
const route = readFileSync("app/api/admin/legiscast-audios/route.ts", "utf8");
const client = readFileSync("components/admin/legiscast-audios-admin.tsx", "utf8");

describe("cobertura editorial do LegisCast", () => {
  it("persiste cobertura adicional sem alterar o vínculo direto do áudio", () => {
    expect(migration).toContain("create table public.legiscast_audio_structure_coverage");
    expect(migration).toContain("legiscast_audios (id, lei_id)");
    expect(migration).toContain("law_structure (id, lei_id)");
    expect(migration).toContain("v_audio.structure_id is not distinct from p_structure_id");
  });

  it("rejeita estrutura de outra lei e torna a associação auditável", () => {
    expect(migration).toContain("lei_id = v_audio.lei_id");
    expect(migration).toContain("Estrutura inválida para a lei deste áudio.");
    expect(migration).toContain("adicionar_cobertura_legiscast");
    expect(migration).toContain("remover_cobertura_legiscast");
  });

  it("protege a tabela e a RPC contra chamadas públicas", () => {
    expect(migration).toContain("enable row level security");
    expect(migration).toContain("revoke all on table public.legiscast_audio_structure_coverage from public, anon, authenticated");
    expect(migration).toContain("revoke all on function public.admin_set_legiscast_audio_structure_coverage");
    expect(migration).toContain("to service_role");
  });

  it("mantém cobertura direta enquanto a migration estiver pendente", () => {
    expect(server).toContain('coverageAvailable: !coverage.error');
    expect(server).toContain("As coberturas editoriais ainda não estão disponíveis");
    expect(client).toContain("cobertura editorial adicional estará disponível após a aplicação da migration");
  });

  it("expõe somente a ação administrativa confirmada e permite remoção", () => {
    expect(server).toContain("updateAdminLegiscastAudioCoverage");
    expect(route).toContain('body.operation === "update-coverage"');
    expect(client).toContain('operation: "update-coverage"');
    expect(client).toContain('action === "add" ? "Cobertura editorial confirmada." : "Cobertura editorial removida."');
  });
});
