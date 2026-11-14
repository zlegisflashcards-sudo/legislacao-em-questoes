export type LegiscastCoverageTrack = {
  id: string;
  structureId: number | null;
  active: boolean;
  /** Futuro vínculo editorial explícito; ausência nunca implica herança. */
  coveredStructureIds?: readonly number[];
};

export type ConfirmedLegiscastAudioCoverage = {
  audioId: string;
  structureId: number;
};

export type LegiscastTrackResolution =
  | { track: LegiscastCoverageTrack; source: "direct" | "editorial" }
  | { pending: "ambiguous"; source: "direct" | "editorial"; trackIds: string[] }
  | null;

/** Adds only persisted editorial coverage to the resolver input. */
export function attachConfirmedLegiscastAudioCoverage(
  tracks: readonly LegiscastCoverageTrack[],
  coverages: readonly ConfirmedLegiscastAudioCoverage[],
): LegiscastCoverageTrack[] {
  const coveredByAudio = new Map<string, number[]>();
  for (const coverage of coverages) {
    const values = coveredByAudio.get(coverage.audioId) ?? [];
    values.push(coverage.structureId);
    coveredByAudio.set(coverage.audioId, values);
  }
  return tracks.map((track) => ({
    ...track,
    coveredStructureIds: [...new Set(coveredByAudio.get(track.id) ?? [])],
  }));
}

/**
 * Uma estrutura recebe uma única faixa aplicável. A cobertura de outro áudio
 * não é descartada só por existir uma faixa direta: isso esconderia uma
 * sobreposição editorial que precisa ser corrigida antes da publicação.
 */
export function resolveLegiscastTrackForStructure(input: {
  structureId: number | null;
  tracks: readonly LegiscastCoverageTrack[];
}): LegiscastTrackResolution {
  if (input.structureId === null) {
    const general = input.tracks.filter((track) => track.active && track.structureId === null);
    return general.length === 1 ? { track: general[0], source: "direct" } : general.length > 1 ? { pending: "ambiguous", source: "direct", trackIds: general.map((track) => track.id).sort() } : null;
  }
  const structureId = input.structureId;
  const direct = input.tracks.filter((track) => track.active && track.structureId === structureId);
  const editorial = input.tracks.filter((track) => track.active && track.structureId !== null && track.coveredStructureIds?.includes(structureId));
  const candidates = [...new Map([...direct, ...editorial].map((track) => [track.id, track])).values()];
  if (candidates.length > 1) return {
    pending: "ambiguous",
    source: direct.length ? "direct" : "editorial",
    trackIds: candidates.map((track) => track.id).sort(),
  };
  if (!candidates.length) return null;
  return { track: candidates[0], source: direct.some((track) => track.id === candidates[0].id) ? "direct" : "editorial" };
}
