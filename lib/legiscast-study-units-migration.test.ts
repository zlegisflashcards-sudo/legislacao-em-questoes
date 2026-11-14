import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync("supabase/migrations/20261114161258_prevent_legiscast_study_unit_overlap.sql", "utf8");

describe("proteção persistente das unidades de estudo do LegisCast", () => {
  it("protege tanto o vínculo direto quanto a cobertura editorial, sem criar hierarquia paralela", () => {
    expect(migration).toContain("create or replace function public.assert_legiscast_study_unit_no_overlap()");
    expect(migration).toContain("before insert or update of lei_id, structure_id, ativo on public.legiscast_audios");
    expect(migration).toContain("before insert or update of audio_id, lei_id, structure_id on public.legiscast_audio_structure_coverage");
    expect(migration).toContain("other_audio.id <> v_audio_id");
    expect(migration).toContain("Remova ou desative a cobertura conflitante antes de salvar.");
  });
});
