import { describe, expect, it } from "vitest";
import { findLegiscastAudioConflicts } from "./legiscast-audio-duplicates-core";

describe("avisos administrativos de duplicidade no LegisCast", () => {
  it("identifica duas faixas ativas diretamente ligadas ao mesmo bloco", () => {
    const conflicts = findLegiscastAudioConflicts([
      { id: "ctb-13-a", leiId: 1, structureId: 13, active: true },
      { id: "ctb-13-b", leiId: 1, structureId: 13, active: true },
      { id: "ctb-16-a", leiId: 1, structureId: 16, active: true },
      { id: "ctb-16-b", leiId: 1, structureId: 16, active: true },
    ]);
    expect(conflicts).toEqual([
      { kind: "direct-duplicate", leiId: 1, structureId: 13, audioIds: ["ctb-13-a", "ctb-13-b"] },
      { kind: "direct-duplicate", leiId: 1, structureId: 16, audioIds: ["ctb-16-a", "ctb-16-b"] },
    ]);
  });

  it("ignora faixas inativas e vínculos em estruturas distintas", () => {
    const conflicts = findLegiscastAudioConflicts([
      { id: "active", leiId: 1, structureId: 13, active: true },
      { id: "inactive", leiId: 1, structureId: 13, active: false },
      { id: "other-structure", leiId: 1, structureId: 14, active: true },
      { id: "other-law", leiId: 2, structureId: 13, active: true },
    ]);
    expect(conflicts).toEqual([]);
  });

  it("classifica sobreposição de cobertura explícita separadamente", () => {
    const conflicts = findLegiscastAudioConflicts([
      { id: "chapter", leiId: 1, structureId: 10, active: true, coveredStructureIds: [11] },
      { id: "section", leiId: 1, structureId: 12, active: true, coveredStructureIds: [11] },
    ]);
    expect(conflicts).toEqual([
      { kind: "coverage-overlap", leiId: 1, structureId: 11, audioIds: ["chapter", "section"] },
    ]);
  });

  it("não acusa duplicidade quando um único áudio cobre vários blocos", () => {
    expect(findLegiscastAudioConflicts([
      { id: "one", leiId: 1, structureId: 10, active: true, coveredStructureIds: [11, 12] },
    ])).toEqual([]);
  });
});
