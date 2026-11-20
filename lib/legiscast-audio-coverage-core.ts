export type LegiscastCoverageTrack = {
  id: string;
  structureId: number | null;
  active: boolean;
  /** Futuro vínculo editorial explícito; ausência nunca implica herança. */
  coveredStructureIds?: readonly number[];
};

export type LegiscastCoverageStructure = {
  id: number;
  parentId: number | null;
};

export type ConfirmedLegiscastAudioCoverage = {
  audioId: string;
  structureId: number;
};

export type LegiscastTrackResolution =
  | { track: LegiscastCoverageTrack; source: "direct" | "editorial" | "ancestor"; coveredByStructureId?: number }
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
  /** A faixa do nó-pai também cobre seus filhos, salvo uma faixa específica. */
  structures?: readonly LegiscastCoverageStructure[];
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
  if (candidates.length) return { track: candidates[0], source: direct.some((track) => track.id === candidates[0].id) ? "direct" : "editorial" };

  const byId = new Map((input.structures ?? []).map((structure) => [structure.id, structure]));
  const visited = new Set<number>([structureId]);
  for (let parentId = byId.get(structureId)?.parentId ?? null; parentId !== null && !visited.has(parentId); parentId = byId.get(parentId)?.parentId ?? null) {
    visited.add(parentId);
    const parentTracks = input.tracks.filter((track) => track.active && track.structureId === parentId);
    if (parentTracks.length === 1) return { track: parentTracks[0], source: "ancestor", coveredByStructureId: parentId };
    if (parentTracks.length > 1) return { pending: "ambiguous", source: "direct", trackIds: parentTracks.map((track) => track.id).sort() };
  }
  return null;
}
