import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const server = readFileSync("lib/admin-legislative-structure-releases.ts", "utf8");
const migration = readFileSync("supabase/migrations/20261112223823_create_legislative_structure_releases.sql", "utf8");
const wholeLawMigration = readFileSync("supabase/migrations/20261119230810_release_all_legislative_structures.sql", "utf8");

describe("liberação administrativa por estrutura", () => {
  it("exige diagnóstico atualizado, administrador e estrutura da mesma lei", () => {
    expect(server).toContain("requireAdmin()");
    expect(server).toContain("getAdminLegislativeStructureIntegrity(slug)");
    expect(server).toContain("A estrutura não pertence a esta lei.");
    expect(server).toContain("canReleaseStructure");
  });

  it("persiste operações idempotentes e audita alterações reais", () => {
    expect(server).toContain('current?.status === (action === "release" ? "released" : "blocked")');
    expect(server).toContain('p_entidade: "liberacao_estrutura_lei"');
    expect(server).toContain("admin_comercial_auditar");
  });

  it("recusa uma prévia cuja integridade mudou antes da liberação", () => {
    expect(server).toContain("integrityFingerprint");
    expect(server).toContain("continuousReadingIntegrityFingerprint(freshTarget)");
    expect(server).toContain('"stale_integrity"');
  });

  it("fica indisponível de modo controlado até a migration existir", () => {
    expect(server).toContain('error?.code === "42P01"');
    expect(server).toContain('"migration_pending"');
  });

  it("mantém RLS e o vínculo lei × estrutura protegidos no banco", () => {
    expect(migration).toContain("foreign key (structure_id, lei_id)");
    expect(migration).toContain("references public.law_structure (id, lei_id)");
    expect(migration).toContain("enable row level security");
    expect(migration).toContain("revoke all on table public.legislative_structure_releases from anon, authenticated");
  });

  it("desativa a liberação geral e exige decisão explícita no Título raiz", () => {
    expect(server).toContain("releaseEntireLegislativeLaw");
    expect(server).toContain("A liberação geral foi desativada.");
    expect(server).toContain("parentId !== null");
    expect(server).not.toContain('rpc("liberar_lei_interativa_completa"');
  });

  it("expõe no painel somente os Títulos, na ordem editorial do diagnóstico", () => {
    expect(server).toContain("report.integrity.reports\n        .filter");
    expect(server).toContain("parentId === null");
    expect(server).toContain("function titleNumber");
    expect(server).toContain("titleNumber(left.name) - titleNumber(right.name)");
  });
});
