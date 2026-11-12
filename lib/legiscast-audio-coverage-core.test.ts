import { describe, expect, it } from "vitest";
import { attachConfirmedLegiscastAudioCoverage, resolveLegiscastTrackForStructure } from "./legiscast-audio-coverage-core";

describe("cobertura segura do áudio LegisCast", () => {
  it("prioriza o áudio ativo diretamente vinculado", () => {
    expect(resolveLegiscastTrackForStructure({ structureId: 2, tracks: [{ id: "parent", structureId: 1, active: true, coveredStructureIds: [2] }, { id: "direct", structureId: 2, active: true }] })).toMatchObject({ source: "direct", track: { id: "direct" } });
  });
  it("aceita cobertura editorial somente quando explícita", () => {
    expect(resolveLegiscastTrackForStructure({ structureId: 2, tracks: [{ id: "parent", structureId: 1, active: true, coveredStructureIds: [2] }] })).toMatchObject({ source: "editorial" });
    expect(resolveLegiscastTrackForStructure({ structureId: 2, tracks: [{ id: "parent", structureId: 1, active: true }] })).toBeNull();
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
