import { describe, expect, it } from "vitest";
import { canExposeContinuousReadingReference, resolveContinuousReadingPartialMode, resolveContinuousReadingPublicAccess } from "./continuous-reading-public-access-core";

const structures = [
  { id: 1, parentId: null, ordem: 1 },
  { id: 2, parentId: 1, ordem: 1 },
  { id: 3, parentId: 1, ordem: 2 },
];
const ready = (structureId: number) => ({ structureId, name: String(structureId), path: [String(structureId)], descendantStructureIds: [structureId], activeQuestionCount: 1, preparedReferenceCount: 1, orphanQuestionCount: 0, pendingAssociationCount: 0, status: "ready" as const, reasons: [] });
const pending = (structureId: number) => ({ ...ready(structureId), status: "pending_blocks" as const, reasons: ["reference_unprepared" as const] });

describe("acesso público estrutural da leitura contínua", () => {
  it("permanece global até a ativação explícita e migrations disponíveis", () => {
    expect(resolveContinuousReadingPartialMode({ requested: false, migrationsAvailable: true, structures })).toMatchObject({ active: false, reason: "disabled" });
    expect(resolveContinuousReadingPartialMode({ requested: true, migrationsAvailable: false, structures })).toMatchObject({ active: false, reason: "migration_unavailable" });
    expect(resolveContinuousReadingPartialMode({ requested: true, migrationsAvailable: true, structures: [] })).toMatchObject({ active: false, reason: "no_structures" });
  });

  it("expõe uma estrutura liberada e encontra a primeira em ordem legislativa", () => {
    const mode = resolveContinuousReadingPartialMode({ requested: true, migrationsAvailable: true, structures });
    expect(resolveContinuousReadingPublicAccess({ mode, structures, reports: [ready(1), ready(2), ready(3)], releases: [{ structureId: 2, status: "released" }] })).toEqual({ mode: "partial", accessibleStructureIds: [2], firstAccessibleStructureId: 2 });
  });

  it("mantém pendente sem liberação própria e rejeita UUID/Ordem fora do recorte", () => {
    const mode = resolveContinuousReadingPartialMode({ requested: true, migrationsAvailable: true, structures });
    const access = resolveContinuousReadingPublicAccess({ mode, structures, reports: [ready(1), ready(2), ready(3)], releases: [{ structureId: 2, status: "released" }] });
    // A mesma decisão vale tanto para um UUID solicitado diretamente quanto
    // para uma âncora antiga resolvida a partir da Ordem.
    expect(canExposeContinuousReadingReference({ access, associationStatus: "editorial", structureId: 1 })).toBe(false);
    expect(canExposeContinuousReadingReference({ access, associationStatus: "editorial", structureId: 99 })).toBe(false);
  });

  it("herda a liberação, mas nunca atravessa bloqueio explícito", () => {
    const mode = resolveContinuousReadingPartialMode({ requested: true, migrationsAvailable: true, structures });
    const access = resolveContinuousReadingPublicAccess({ mode, structures, reports: [ready(1), ready(2), ready(3)], releases: [{ structureId: 1, status: "released" }, { structureId: 2, status: "blocked" }] });
    expect(access.accessibleStructureIds).toEqual([1, 3]);
    expect(canExposeContinuousReadingReference({ access, associationStatus: "editorial", structureId: 2 })).toBe(false);
    expect(canExposeContinuousReadingReference({ access, associationStatus: "editorial", structureId: 3 })).toBe(true);
  });

  it("nega estrutura pendente, associação inferida e vínculo sem estrutura", () => {
    const mode = resolveContinuousReadingPartialMode({ requested: true, migrationsAvailable: true, structures });
    const access = resolveContinuousReadingPublicAccess({ mode, structures, reports: [ready(1), pending(2), ready(3)], releases: [{ structureId: 1, status: "released" }] });
    expect(access.accessibleStructureIds).toEqual([1, 3]);
    expect(canExposeContinuousReadingReference({ access, associationStatus: "associated", structureId: 3 })).toBe(false);
    expect(canExposeContinuousReadingReference({ access, associationStatus: "editorial", structureId: null })).toBe(false);
  });

  it("reavalia a integridade depois da liberação e mantém o global compatível", () => {
    const active = resolveContinuousReadingPartialMode({ requested: true, migrationsAvailable: true, structures });
    const accessAfterLoss = resolveContinuousReadingPublicAccess({ mode: active, structures, reports: [ready(1), { ...ready(2), status: "orphan_questions", reasons: ["orphan_question"] }, ready(3)], releases: [{ structureId: 2, status: "released" }] });
    expect(accessAfterLoss.accessibleStructureIds).toEqual([]);

    const global = resolveContinuousReadingPublicAccess({ mode: resolveContinuousReadingPartialMode({ requested: false, migrationsAvailable: true, structures }), structures, reports: [], releases: [] });
    expect(canExposeContinuousReadingReference({ access: global, associationStatus: "unassociated", structureId: null })).toBe(true);
  });
});
