export type LegiscastDuplicateCandidate = {
  id: string;
  leiId: number;
  structureId: number | null;
  /** Ordem editorial dentro da playlist da estrutura. */
  order?: number | null;
  active: boolean;
  /** Somente coberturas editoriais persistidas; nunca inferidas pela hierarquia. */
  coveredStructureIds?: readonly number[];
};

export type LegiscastAudioConflict = {
  kind: "direct-duplicate" | "coverage-overlap";
  leiId: number;
  structureId: number;
  audioIds: string[];
};

function conflictsForClaims(
  kind: LegiscastAudioConflict["kind"],
  claims: Map<string, string[]>,
) {
  return [...claims.entries()]
    .map(([key, audioIds]) => {
      const [leiId, structureId] = key.split(":").map(Number);
      return {
        kind,
        leiId,
        structureId,
        audioIds: [...new Set(audioIds)].sort(),
      } satisfies LegiscastAudioConflict;
    })
    .filter((conflict) => conflict.audioIds.length >= 2);
}

/**
 * Identifica conflitos editoriais sem assumir que os arquivos são idênticos.
 * Vínculos diretos e coberturas explícitas são deliberadamente relatados em
 * grupos distintos para que a equipe saiba qual vínculo deve revisar.
 */
export function findLegiscastAudioConflicts(
  tracks: readonly LegiscastDuplicateCandidate[],
) {
  const directClaims = new Map<string, string[]>();
  const coverageClaims = new Map<string, string[]>();

  for (const track of tracks) {
    if (!track.active) continue;
    if (track.structureId !== null) {
      // Uma estrutura pode ter vários episódios. Só há duplicidade direta se
      // duas faixas ativas disputam a mesma posição da playlist; faixas 1, 2,
      // 3… são a sequência editorial normal daquele recorte.
      const key = `${track.leiId}:${track.structureId}:${track.order ?? 0}`;
      directClaims.set(key, [...(directClaims.get(key) ?? []), track.id]);
    }
    for (const structureId of new Set(track.coveredStructureIds ?? [])) {
      const key = `${track.leiId}:${structureId}`;
      coverageClaims.set(key, [...(coverageClaims.get(key) ?? []), track.id]);
    }
  }

  return [
    ...conflictsForClaims("direct-duplicate", directClaims),
    ...conflictsForClaims("coverage-overlap", coverageClaims),
  ].sort(
    (left, right) =>
      left.leiId - right.leiId ||
      left.structureId - right.structureId ||
      left.kind.localeCompare(right.kind),
  );
}
