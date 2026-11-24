import { continuousReadingStructurePath, orderContinuousReadingStructures, type ContinuousReadingStructureNode } from "./continuous-reading-structure-core";
import type { StructureReleaseRecord } from "./continuous-reading-structure-release-core";
import type { ContinuousReadingStructureIntegrity } from "./continuous-reading-structure-integrity-core";
import type { ContinuousReadingPublicAccess } from "./continuous-reading-public-access-core";

export function scopedStructurePublication(input: {
  selectedIds: ReadonlySet<number>;
  structures: readonly ContinuousReadingStructureNode[];
  releases: readonly StructureReleaseRecord[];
  reports: readonly ContinuousReadingStructureIntegrity[];
  inventoryAvailable: boolean;
}): ContinuousReadingPublicAccess {
  const status = new Map(input.releases.map((record) => [record.structureId, record.status]));
  const ready = new Set(input.reports.filter((report) => report.status === "ready").map((report) => report.structureId));
  const accessibleStructureIds = !input.inventoryAvailable ? [] : orderContinuousReadingStructures(input.structures)
    .filter((node) => {
      if (!ready.has(node.id)) return false;
      const path = continuousReadingStructurePath(node.id, input.structures);
      // Um ancestral é sinônimo de conteúdo só quando foi selecionado no recorte.
      // Seu estado de publicação pode autorizar uma seleção mais estreita; nunca amplia o recorte.
      return path.some((ancestor) => input.selectedIds.has(ancestor.id))
        && !path.some((ancestor) => status.get(ancestor.id) === "blocked")
        && path.some((ancestor) => status.get(ancestor.id) === "released" && ready.has(ancestor.id));
    })
    .map((node) => node.id);
  return { mode: "partial", accessibleStructureIds, firstAccessibleStructureId: accessibleStructureIds[0] ?? null };
}
