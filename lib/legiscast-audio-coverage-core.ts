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
 * Prioriza a faixa direta. Uma faixa de outra estrutura só é retornada quando
 * a cobertura editorial inclui expressamente o destino; `structure_id` por si
 * só identifica o destino principal, não a sua abrangência.
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
  if (direct.length === 1) return { track: direct[0], source: "direct" };
  if (direct.length > 1) return { pending: "ambiguous", source: "direct", trackIds: direct.map((track) => track.id).sort() };
  const editorial = input.tracks.filter((track) => track.active && track.structureId !== null && track.coveredStructureIds?.includes(structureId));
  if (editorial.length === 1) return { track: editorial[0], source: "editorial" };
  return editorial.length > 1 ? { pending: "ambiguous", source: "editorial", trackIds: editorial.map((track) => track.id).sort() } : null;
}
