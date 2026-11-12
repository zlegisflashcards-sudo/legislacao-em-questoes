import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const server = readFileSync("lib/admin-legislative-structure-releases.ts", "utf8");
const migration = readFileSync("supabase/migrations/20261112194500_create_legislative_structure_releases.sql", "utf8");

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
});
