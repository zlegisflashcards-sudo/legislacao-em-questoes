import { describe, expect, it } from "vitest";
import { scopedStructurePublication } from "./scoped-structure-publication";
import type { ContinuousReadingStructureIntegrity } from "./continuous-reading-structure-integrity-core";

const structures = [{ id: 1, parentId: null, ordem: 1 }, { id: 2, parentId: 1, ordem: 1 }, { id: 3, parentId: 1, ordem: 2 }, { id: 4, parentId: null, ordem: 2 }, { id: 5, parentId: 4, ordem: 1 }];
const reports = structures.map(({ id }): ContinuousReadingStructureIntegrity => ({ structureId: id, name: String(id), path: [], descendantStructureIds: [id], activeQuestionCount: 1, preparedReferenceCount: 1, orphanQuestionCount: 0, pendingAssociationCount: 0, status: "ready", reasons: [] }));
const base = { selectedIds: new Set([2, 4]), structures, releases: [] as Array<{structureId: number; status: "released" | "blocked"}>, reports, inventoryAvailable: true };

describe("publicação de leitura pela estrutura do recorte", () => {
  it("não abre o livro inteiro quando nenhuma estrutura foi publicada", () => {
    expect(scopedStructurePublication(base)).toEqual({ mode: "partial", accessibleStructureIds: [], firstAccessibleStructureId: null });
  });
  it("abre só o primeiro trecho liberado, mesmo sem liberar o livro", () => {
    expect(scopedStructurePublication({ ...base, releases: [{ structureId: 2, status: "released" }] }).accessibleStructureIds).toEqual([2]);
  });
  it("não cruza a seleção e incorpora os trechos adicionais aprovados", () => {
    expect(scopedStructurePublication({ ...base, releases: [{ structureId: 1, status: "released" }, { structureId: 4, status: "released" }] }).accessibleStructureIds).toEqual([2, 4, 5]);
  });
  it("mantém o bloqueio explícito e a revisão atual", () => {
    expect(scopedStructurePublication({ ...base, releases: [{ structureId: 1, status: "blocked" }, { structureId: 2, status: "released" }, { structureId: 4, status: "released" }], reports: reports.map((report) => report.structureId === 5 ? { ...report, status: "orphan_questions" } : report) }).accessibleStructureIds).toEqual([4]);
  });
  it("fica em preparação se a base oficial não puder ser verificada", () => {
    expect(scopedStructurePublication({ ...base, inventoryAvailable: false, releases: [{ structureId: 2, status: "released" }] }).accessibleStructureIds).toEqual([]);
  });
});
