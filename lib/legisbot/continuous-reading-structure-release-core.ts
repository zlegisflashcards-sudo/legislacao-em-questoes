import { continuousReadingStructureDescendantIds, continuousReadingStructurePath, type ContinuousReadingStructureNode } from "./continuous-reading-structure-core";
import type { ContinuousReadingStructureIntegrity } from "./continuous-reading-structure-integrity-core";

export type StructureReleaseRecord = { structureId: number; status: "released" | "blocked" };
export type StructureReleaseViewStatus = "pending" | "ready" | "released";

function recordsByStructure(records: readonly StructureReleaseRecord[]) {
  return new Map(records.map((record) => [record.structureId, record]));
}

/** Uma liberação de recorte nunca ignora bloqueio explícito de descendente. */
export function hasExplicitBlockedDescendant(structureId: number, structures: readonly ContinuousReadingStructureNode[], records: readonly StructureReleaseRecord[]) {
  const byStructure = recordsByStructure(records);
  return continuousReadingStructureDescendantIds(structureId, structures)
    .some((id) => id !== structureId && byStructure.get(id)?.status === "blocked");
}

export function canReleaseStructure(input: {
  report: ContinuousReadingStructureIntegrity;
  structures: readonly ContinuousReadingStructureNode[];
  records: readonly StructureReleaseRecord[];
}) {
  if (input.report.status !== "ready") return { allowed: false, reason: "integrity_not_ready" as const };
  if (hasExplicitBlockedDescendant(input.report.structureId, input.structures, input.records)) return { allowed: false, reason: "blocked_descendant" as const };
  return { allowed: true, reason: null };
}

/**
 * A liberação integral continua sendo uma decisão manual, mas só pode ser
 * oferecida quando a lei inteira estiver pronta. Um bloqueio explícito vence
 * inclusive nesta operação geral: nunca o apagamos silenciosamente.
 */
export function canReleaseEntireLaw(input: {
  reports: readonly ContinuousReadingStructureIntegrity[];
  records: readonly StructureReleaseRecord[];
}) {
  if (!input.reports.length) return { allowed: false, reason: "no_structures" as const };
  if (input.reports.some((report) => report.status !== "ready")) return { allowed: false, reason: "integrity_not_ready" as const };
  if (input.records.some((record) => record.status === "blocked")) return { allowed: false, reason: "blocked_structure" as const };
  return { allowed: true, reason: null };
}

/** Estado para administração; bloqueado é exibido como pendente com explicação. */
export function structureReleaseViewStatus(input: {
  report: ContinuousReadingStructureIntegrity;
  structures: readonly ContinuousReadingStructureNode[];
  records: readonly StructureReleaseRecord[];
}): StructureReleaseViewStatus {
  const current = recordsByStructure(input.records).get(input.report.structureId);
  if (current?.status === "blocked") return "pending";
  if (current?.status === "released") return hasExplicitBlockedDescendant(input.report.structureId, input.structures, input.records) ? "pending" : "released";
  return input.report.status === "ready" ? "ready" : "pending";
}

/**
 * Política para a futura rota pública: um registro liberado cobre seu recorte,
 * mas qualquer bloqueio no caminho raiz→nó ou no próprio nó o interrompe.
 * Ela não cria registros para descendentes.
 */
export function isStructureEffectivelyReleased(structureId: number, structures: readonly ContinuousReadingStructureNode[], records: readonly StructureReleaseRecord[]) {
  const byStructure = recordsByStructure(records);
  const path = continuousReadingStructurePath(structureId, structures);
  if (!path.length) return false;
  let released = false;
  for (const node of path) {
    const record = byStructure.get(node.id);
    if (record?.status === "blocked") return false;
    if (record?.status === "released") released = true;
  }
  return released;
}
