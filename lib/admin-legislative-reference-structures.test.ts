import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const server = readFileSync("lib/admin-legislative-reference-structures.ts", "utf8");
const migration = readFileSync("supabase/migrations/20261112190000_add_legislative_reference_structure_link.sql", "utf8");

describe("administração da associação estrutural das referências", () => {
  it("prioriza o vínculo confirmado e mantém sugestão separada", () => {
    expect(server).toContain("structureId: item.structure_id");
    expect(server).toContain("suggestionStatus");
    expect(server).toContain("currentStructureId: reference.structure_id");
  });

  it("valida lei no servidor e no banco, preservando bloco sem estrutura", () => {
    expect(server).toContain("assertLegislativeReferenceStructureLaw");
    expect(server).toContain("update({ structure_id: structureId })");
    expect(migration).toContain("foreign key (structure_id, lei_id)");
    expect(migration).toContain("references public.law_structure (id, lei_id)");
    expect(migration).toContain("on delete set null (structure_id)");
  });

  it("audita confirmação, substituição e remoção manual", () => {
    expect(server).toContain("admin_comercial_auditar");
    expect(server).toContain('entidade: "referencia_legislativa_estrutura"');
  });
});
