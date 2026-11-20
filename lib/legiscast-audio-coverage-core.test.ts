import { describe, expect, it } from "vitest";
import { attachConfirmedLegiscastAudioCoverage, resolveLegiscastTrackForStructure } from "./legiscast-audio-coverage-core";

describe("cobertura segura do áudio LegisCast", () => {
  it("não esconde uma sobreposição entre áudio direto e cobertura editorial", () => {
    expect(resolveLegiscastTrackForStructure({ structureId: 2, tracks: [{ id: "parent", structureId: 1, active: true, coveredStructureIds: [2] }, { id: "direct", structureId: 2, active: true }] })).toEqual({ pending: "ambiguous", source: "direct", trackIds: ["direct", "parent"] });
  });
  it("aceita cobertura editorial somente quando explícita", () => {
    expect(resolveLegiscastTrackForStructure({ structureId: 2, tracks: [{ id: "parent", structureId: 1, active: true, coveredStructureIds: [2] }] })).toMatchObject({ source: "editorial" });
    expect(resolveLegiscastTrackForStructure({ structureId: 2, tracks: [{ id: "parent", structureId: 1, active: true }] })).toBeNull();
  });
  it("reconhece a cobertura da faixa do ancestral quando não há uma faixa mais específica", () => {
    const structures = [{ id: 1, parentId: null }, { id: 2, parentId: 1 }, { id: 3, parentId: 2 }];
    expect(resolveLegiscastTrackForStructure({ structureId: 3, structures, tracks: [{ id: "chapter", structureId: 1, active: true }] })).toEqual({
      track: { id: "chapter", structureId: 1, active: true },
      source: "ancestor",
      coveredByStructureId: 1,
    });
  });
  it("prioriza a faixa específica à cobertura do ancestral", () => {
    const structures = [{ id: 1, parentId: null }, { id: 2, parentId: 1 }];
    expect(resolveLegiscastTrackForStructure({ structureId: 2, structures, tracks: [{ id: "chapter", structureId: 1, active: true }, { id: "section", structureId: 2, active: true }] })).toMatchObject({
      track: { id: "section" }, source: "direct",
    });
  });
  it("ignora faixa inativa e mantém lei sem estrutura em áudio geral direto", () => {
    expect(resolveLegiscastTrackForStructure({ structureId: 2, tracks: [{ id: "off", structureId: 2, active: false }] })).toBeNull();
    expect(resolveLegiscastTrackForStructure({ structureId: null, tracks: [{ id: "law", structureId: null, active: true }] })).toMatchObject({ source: "direct", track: { id: "law" } });
  });

  it("não escolhe faixa arbitrária quando coberturas entram em conflito", () => {
    expect(resolveLegiscastTrackForStructure({ structureId: 2, tracks: [
      { id: "first", structureId: 1, active: true, coveredStructureIds: [2] },
      { id: "second", structureId: 3, active: true, coveredStructureIds: [2] },
    ] })).toEqual({ pending: "ambiguous", source: "editorial", trackIds: ["first", "second"] });
  });

  it("usa somente associações editoriais persistidas para adicionar cobertura", () => {
    expect(attachConfirmedLegiscastAudioCoverage(
      [{ id: "audio", structureId: 1, active: true }],
      [{ audioId: "audio", structureId: 2 }, { audioId: "audio", structureId: 2 }, { audioId: "other", structureId: 3 }],
    )).toEqual([{ id: "audio", structureId: 1, active: true, coveredStructureIds: [2] }]);
  });
});
