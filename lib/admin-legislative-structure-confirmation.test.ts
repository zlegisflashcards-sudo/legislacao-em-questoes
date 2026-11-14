import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const service = readFileSync("lib/admin-legislative-structure-releases.ts", "utf8");
const action = readFileSync("app/admin/artigos/reference-actions.ts", "utf8");
const preview = readFileSync("components/admin/legislative-structure-confirmation-preview.tsx", "utf8");
const migration = readFileSync("supabase/migrations/20261113010000_confirm_and_release_legislative_structure.sql", "utf8");

describe("confirmação única da estrutura da Lei Interativa", () => {
  it("fecha a prévia por UUID e usa o botão como confirmação explícita", () => {
    expect(preview).toContain("includedIds.includes(reference.referenceId)");
    expect(preview).toContain("Ao confirmar, você declara");
    expect(preview).toContain("Artigos sem vínculo editorial");
    expect(preview).toContain("Incluir neste capítulo");
    expect(preview).toContain("Retirar");
    expect(action).not.toContain('value(formData, "confirmation") !== "CONFIRMAR E LIBERAR"');
    expect(action).toContain('formData.getAll("reference_id")');
  });

  it("simula as associações propostas antes de chamar a operação atômica", () => {
    expect(service).toContain("getAdminLegislativeStructureIntegrity(slug, proposed)");
    expect(service).toContain("canReleaseStructure");
    expect(service).toContain("invalid_candidates");
    expect(service).toContain("p_snapshot: current.integritySnapshot");
    expect(service).toContain("idempotent: true");
  });

  it("protege a transação contra concorrência, leis diferentes e vínculos conflitantes", () => {
    expect(migration).toContain("pg_advisory_xact_lock(p_lei_id)");
    expect(migration).toContain("in share row exclusive mode");
    expect(migration).toContain("v_snapshot is distinct from p_snapshot");
    expect(migration).toContain("'sourceQuestionId', r.source_question_id");
    expect(migration).toContain("lei_id = p_lei_id and id = any(p_reference_ids)");
    expect(migration).toContain("structure_id is null");
    expect(migration).toContain("begin;");
    expect(migration).toContain("commit;");
  });

  it("só persiste a liberação depois de validar e gravar as associações no mesmo escopo", () => {
    expect(migration.indexOf("update public.legislative_references set structure_id")).toBeLessThan(migration.indexOf("insert into public.legislative_structure_releases"));
    expect(migration).toContain("admin_comercial_auditar");
    expect(migration).toContain("revoke all on function");
    expect(migration).toContain("to service_role");
    expect(service).toContain('error?.code === "PGRST202"');
    expect(service).toContain("confirmationRpcAvailable");
  });
});
