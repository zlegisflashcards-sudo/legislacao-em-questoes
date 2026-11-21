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

  it("expõe o ramo de uma raiz liberada e encontra a primeira em ordem legislativa", () => {
    const mode = resolveContinuousReadingPartialMode({ requested: true, migrationsAvailable: true, structures });
    expect(resolveContinuousReadingPublicAccess({ mode, structures, reports: [ready(1), ready(2), ready(3)], releases: [{ structureId: 1, status: "released" }] })).toEqual({ mode: "partial", accessibleStructureIds: [1, 2, 3], firstAccessibleStructureId: 1 });
  });

  it("não expõe nem a raiz nem os filhos quando o Título está fechado", () => {
    const mode = resolveContinuousReadingPartialMode({ requested: true, migrationsAvailable: true, structures });
    const access = resolveContinuousReadingPublicAccess({ mode, structures, reports: [ready(1), ready(2), ready(3)], releases: [{ structureId: 2, status: "released" }] });
    expect(access).toEqual({ mode: "partial", accessibleStructureIds: [], firstAccessibleStructureId: null });
    expect(canExposeContinuousReadingReference({ access, associationStatus: "editorial", structureId: 2 })).toBe(false);
  });

  it("mantém a navegação pública na ordem pai-filho, e não na ordem plana dos registros", () => {
    const nested = [
      { id: 11, parentId: 10, ordem: 1 },
      { id: 20, parentId: null, ordem: 2 },
      { id: 10, parentId: null, ordem: 10 },
    ];
    const reports = nested.map((structure) => ready(structure.id));
    const access = resolveContinuousReadingPublicAccess({
      mode: resolveContinuousReadingPartialMode({ requested: true, migrationsAvailable: true, structures: nested }),
      structures: nested,
      reports,
      releases: [{ structureId: 10, status: "released" }, { structureId: 20, status: "released" }],
    });
    expect(access).toEqual({ mode: "partial", accessibleStructureIds: [20, 10, 11], firstAccessibleStructureId: 20 });
  });

  it("mantém pendente sem liberação própria e rejeita UUID/Ordem fora do recorte", () => {
    const mode = resolveContinuousReadingPartialMode({ requested: true, migrationsAvailable: true, structures });
    const access = resolveContinuousReadingPublicAccess({ mode, structures, reports: [ready(1), ready(2), ready(3)], releases: [{ structureId: 2, status: "released" }] });
    // A mesma decisão vale tanto para um UUID solicitado diretamente quanto
    // para uma âncora antiga resolvida a partir da Ordem.
    expect(canExposeContinuousReadingReference({ access, associationStatus: "editorial", structureId: 1 })).toBe(false);
    expect(canExposeContinuousReadingReference({ access, associationStatus: "editorial", structureId: 99 })).toBe(false);
  });

  it("fecha todo o ramo quando a raiz é bloqueada", () => {
    const mode = resolveContinuousReadingPartialMode({ requested: true, migrationsAvailable: true, structures });
    const access = resolveContinuousReadingPublicAccess({ mode, structures, reports: [ready(1), ready(2), ready(3)], releases: [{ structureId: 1, status: "blocked" }] });
    expect(access.accessibleStructureIds).toEqual([]);
    expect(canExposeContinuousReadingReference({ access, associationStatus: "editorial", structureId: 2 })).toBe(false);
    expect(canExposeContinuousReadingReference({ access, associationStatus: "editorial", structureId: 3 })).toBe(false);
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
