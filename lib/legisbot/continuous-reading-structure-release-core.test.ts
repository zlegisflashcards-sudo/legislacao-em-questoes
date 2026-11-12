import { describe, expect, it } from "vitest";
import { canReleaseStructure, hasExplicitBlockedDescendant, isStructureEffectivelyReleased, structureReleaseViewStatus } from "./continuous-reading-structure-release-core";

const structures = [
  { id: 1, parentId: null, ordem: 1 },
  { id: 2, parentId: 1, ordem: 1 },
  { id: 3, parentId: 1, ordem: 2 },
];
const ready = { structureId: 1, name: "Título", path: ["Título"], descendantStructureIds: [1, 2, 3], activeQuestionCount: 2, preparedReferenceCount: 2, orphanQuestionCount: 0, pendingAssociationCount: 0, status: "ready" as const, reasons: [] };
const pending = { ...ready, structureId: 2, status: "pending_blocks" as const, reasons: ["reference_unprepared" as const] };

describe("política de liberação estrutural", () => {
  it("permite liberar somente estrutura pronta", () => {
    expect(canReleaseStructure({ report: ready, structures, records: [] })).toEqual({ allowed: true, reason: null });
    expect(canReleaseStructure({ report: pending, structures, records: [] })).toEqual({ allowed: false, reason: "integrity_not_ready" });
    expect(canReleaseStructure({ report: { ...ready, status: "orphan_questions", reasons: ["orphan_question"] }, structures, records: [] })).toEqual({ allowed: false, reason: "integrity_not_ready" });
    expect(canReleaseStructure({ report: { ...ready, status: "ambiguous", reasons: ["reference_ambiguous"] }, structures, records: [] })).toEqual({ allowed: false, reason: "integrity_not_ready" });
  });

  it("não permite ancestral liberado ignorar bloqueio explícito de descendente", () => {
    const records = [{ structureId: 3, status: "blocked" as const }];
    expect(hasExplicitBlockedDescendant(1, structures, records)).toBe(true);
    expect(canReleaseStructure({ report: ready, structures, records })).toEqual({ allowed: false, reason: "blocked_descendant" });
  });

  it("mantém bloqueio idempotente e mascara a herança de liberação", () => {
    const records = [{ structureId: 1, status: "released" as const }, { structureId: 2, status: "blocked" as const }];
    expect(isStructureEffectivelyReleased(3, structures, records)).toBe(true);
    expect(isStructureEffectivelyReleased(2, structures, records)).toBe(false);
    expect(structureReleaseViewStatus({ report: ready, structures, records })).toBe("pending");
  });

  it("não considera uma lei sem estruturas como liberada", () => {
    expect(isStructureEffectivelyReleased(1, [], [])).toBe(false);
  });
});
