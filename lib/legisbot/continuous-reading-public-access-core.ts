import type { ContinuousReadingStructureIntegrity } from "./continuous-reading-structure-integrity-core";
import { isStructureEffectivelyReleased, type StructureReleaseRecord } from "./continuous-reading-structure-release-core";
import type { ContinuousReadingStructureNode } from "./continuous-reading-structure-core";

export type ContinuousReadingPartialMode =
  | { requested: false; active: false; reason: "disabled" }
  | { requested: true; active: false; reason: "migration_unavailable" | "no_structures" }
  | { requested: true; active: true; reason: null };

export type ContinuousReadingPublicAccess = {
  mode: "global" | "partial";
  accessibleStructureIds: number[];
  firstAccessibleStructureId: number | null;
};

/**
 * O modo parcial é opt-in por lei. A ausência de qualquer migration mantém a
 * leitura global já publicada, em vez de transformar uma janela de deploy em
 * uma liberação parcial acidental.
 */
export function resolveContinuousReadingPartialMode(input: {
  requested: boolean;
  migrationsAvailable: boolean;
  structures: readonly ContinuousReadingStructureNode[];
}): ContinuousReadingPartialMode {
  if (!input.requested) return { requested: false, active: false, reason: "disabled" };
  if (!input.migrationsAvailable) return { requested: true, active: false, reason: "migration_unavailable" };
  if (!input.structures.length) return { requested: true, active: false, reason: "no_structures" };
  return { requested: true, active: true, reason: null };
}

/**
 * Resolve o recorte público sem criar liberações implícitas. Uma estrutura só
 * entra quando continua íntegra na leitura atual e possui liberação própria ou
 * herdada. Um bloqueio explícito interrompe a herança no caminho raiz→nó.
 */
export function resolveContinuousReadingPublicAccess(input: {
  mode: ContinuousReadingPartialMode;
  structures: readonly ContinuousReadingStructureNode[];
  reports: readonly ContinuousReadingStructureIntegrity[];
  releases: readonly StructureReleaseRecord[];
}): ContinuousReadingPublicAccess {
  if (!input.mode.active) return { mode: "global", accessibleStructureIds: [], firstAccessibleStructureId: null };

  const reportByStructure = new Map(input.reports.map((report) => [report.structureId, report]));
  const accessibleStructureIds = input.structures
    .slice()
    .sort((left, right) => left.ordem - right.ordem || left.id - right.id)
    .filter((structure) => reportByStructure.get(structure.id)?.status === "ready")
    .filter((structure) => isStructureEffectivelyReleased(structure.id, input.structures, input.releases))
    .map((structure) => structure.id);

  return {
    mode: "partial",
    accessibleStructureIds,
    firstAccessibleStructureId: accessibleStructureIds[0] ?? null,
  };
}

/** Apenas um vínculo editorial confirmado autoriza a exposição parcial. */
export function canExposeContinuousReadingReference(input: {
  access: ContinuousReadingPublicAccess;
  associationStatus: "editorial" | "associated" | "unassociated" | "ambiguous";
  structureId: number | null;
}) {
  if (input.access.mode === "global") return true;
  return input.associationStatus === "editorial" && input.structureId !== null && input.access.accessibleStructureIds.includes(input.structureId);
}
