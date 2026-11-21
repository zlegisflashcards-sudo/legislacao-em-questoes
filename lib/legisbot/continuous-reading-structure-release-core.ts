import { continuousReadingStructureDescendantIds, continuousReadingStructurePath, type ContinuousReadingStructureNode } from "./continuous-reading-structure-core";
import type { ContinuousReadingStructureIntegrity } from "./continuous-reading-structure-integrity-core";

export type StructureReleaseRecord = { structureId: number; status: "released" | "blocked" };
export type StructureReleaseViewStatus = "pending" | "ready" | "released";

function recordsByStructure(records: readonly StructureReleaseRecord[]) {
  return new Map(records.map((record) => [record.structureId, record]));
}

function isRootStructure(structureId: number, structures: readonly ContinuousReadingStructureNode[]) {
  return structures.find((structure) => structure.id === structureId)?.parentId === null;
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
  // A unidade de publicação é a raiz do sumário (normalmente, o Título).
  // Filhos só descrevem a navegação e nunca recebem uma liberação própria.
  if (!isRootStructure(input.report.structureId, input.structures)) return { allowed: false, reason: "root_required" as const };
  if (input.report.status !== "ready") return { allowed: false, reason: "integrity_not_ready" as const };
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
  // A liberação é uma intenção administrativa persistida, não uma garantia de
  // que a leitura ainda pode ser exposta. Se texto, associação ou cobertura
  // mudarem depois dela, a tela não pode continuar verde até nova revisão.
  if (input.report.status !== "ready") return "pending";
  // Registros legados em filhos não têm efeito de publicação e também não
  // podem pintar uma subdivisão como liberada na administração.
  if (!isRootStructure(input.report.structureId, input.structures)) return "ready";
  if (current?.status === "blocked") return "pending";
  if (current?.status === "released") return "released";
  return "ready";
}

/**
 * A abertura é decidida exclusivamente na raiz. Assim uma liberação legada
 * gravada em um filho não expõe um capítulo de um Título fechado, e fechar o
 * Título remove todo o seu ramo do sumário do aluno.
 */
export function isStructureEffectivelyReleased(structureId: number, structures: readonly ContinuousReadingStructureNode[], records: readonly StructureReleaseRecord[]) {
  const byStructure = recordsByStructure(records);
  const path = continuousReadingStructurePath(structureId, structures);
  if (!path.length) return false;
  return byStructure.get(path[0].id)?.status === "released";
}
