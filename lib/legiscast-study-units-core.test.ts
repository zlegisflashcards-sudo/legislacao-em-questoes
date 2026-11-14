import { describe, expect, it } from "vitest";
import { resolveLegiscastStudyUnitForStructure, resolveLegiscastStudyUnits } from "./legiscast-study-units-core";

const structures = [
  { id: 1, parentId: null, ordem: 1, name: "Capítulo I" },
  { id: 2, parentId: 1, ordem: 1, name: "Seção I" },
  { id: 3, parentId: 1, ordem: 2, name: "Seção II" },
  { id: 4, parentId: 2, ordem: 1, name: "Subseção I" },
];

describe("unidades de estudo do LegisCast", () => {
  it("mantém um capítulo com uma única faixa como uma unidade, inclusive as seções explicitamente cobertas", () => {
    const result = resolveLegiscastStudyUnits({ structures, tracks: [{ id: "chapter", structureId: 1, active: true, coveredStructureIds: [2, 3, 4] }] });
    expect(result.conflicts).toEqual([]);
    expect(result.units).toEqual([{ id: "audio:chapter", kind: "audio", audioId: "chapter", titleStructureId: 1, structureIds: [1, 2, 4, 3] }]);
    expect(resolveLegiscastStudyUnitForStructure(3, result.units)?.id).toBe("audio:chapter");
  });

  it("mantém seções com faixas distintas como unidades separadas e o capítulo como unidade textual quando possui conteúdo próprio", () => {
    const result = resolveLegiscastStudyUnits({ structures, tracks: [
      { id: "section-one", structureId: 2, active: true },
      { id: "section-two", structureId: 3, active: true },
    ] });
    expect(result.units.map((unit) => unit.id)).toEqual(["text:1", "audio:section-one", "text:4", "audio:section-two"]);
  });

  it("não presume que uma faixa cobre descendentes e cria leitura textual segura para estruturas sem áudio", () => {
    const result = resolveLegiscastStudyUnits({ structures, tracks: [{ id: "chapter", structureId: 1, active: true }] });
    expect(result.units.find((unit) => unit.id === "audio:chapter")?.structureIds).toEqual([1]);
    expect(result.units.find((unit) => unit.id === "text:2")).toBeTruthy();
  });

  it("não escolhe uma faixa quando duas cobrem a mesma estrutura", () => {
    const result = resolveLegiscastStudyUnits({ structures, tracks: [
      { id: "chapter", structureId: 1, active: true, coveredStructureIds: [2] },
      { id: "section", structureId: 2, active: true },
    ] });
    expect(result.conflicts).toEqual([{ structureId: 2, audioIds: ["chapter", "section"] }]);
    expect(resolveLegiscastStudyUnitForStructure(2, result.units)).toMatchObject({ id: "text:2", kind: "text" });
    expect(result.units.some((unit) => unit.id === "audio:chapter")).toBe(false);
  });

  it("permite que o mesmo áudio cubra mais de uma estrutura sem duplicar a faixa", () => {
    const result = resolveLegiscastStudyUnits({ structures, tracks: [{ id: "one", structureId: 2, active: true, coveredStructureIds: [3] }] });
    expect(result.units.filter((unit) => unit.audioId === "one")).toHaveLength(1);
    expect(resolveLegiscastStudyUnitForStructure(3, result.units)?.id).toBe("audio:one");
  });

  it("preserva a estrutura marcada como áudio não se aplica como leitura textual", () => {
    const result = resolveLegiscastStudyUnits({
      structures,
      tracks: [{ id: "chapter", structureId: 1, active: true, coveredStructureIds: [2] }],
      notApplicableStructureIds: [2],
    });
    expect(resolveLegiscastStudyUnitForStructure(2, result.units)).toMatchObject({ id: "text:2", kind: "text" });
  });
});
