type Structure = { id: number; parent_id: number | null };

/** Unknown nodes, cyclic trees, and partial subtrees never qualify. */
export function fullyContainedStructureIds(structures: readonly Structure[], allowed: ReadonlySet<number>) {
  const byId = new Map(structures.map((node) => [node.id, node]));
  const contained = new Set([...allowed].filter((id) => byId.has(id)));
  for (const node of structures) {
    const path: number[] = [];
    const seen = new Set<number>();
    let current: number | null = node.id;
    while (current !== null) {
      if (seen.has(current) || !byId.has(current)) {
        for (const id of path) contained.delete(id);
        break;
      }
      seen.add(current);
      path.push(current);
      if (!allowed.has(node.id)) contained.delete(current);
      current = byId.get(current)?.parent_id ?? null;
    }
  }
  return contained;
}

export function audioFullyContained(input: {
  primaryId: number | null;
  explicitCoverageIds: readonly number[];
  fullyContainedIds: ReadonlySet<number>;
}) {
  const { primaryId, explicitCoverageIds, fullyContainedIds } = input;
  // A navigation association alone does not certify what the file contains.
  return primaryId !== null && explicitCoverageIds.length > 0 &&
    fullyContainedIds.has(primaryId) && explicitCoverageIds.every((id) => fullyContainedIds.has(id));
}

/** Proposed playback boundary: this must be the version the signer can pin,
 * not a HEAD response followed by a mutable path-only signing call. */
export type ImmutablePlaybackObject = { bucket: string; key: string; version: string };
type AudioAsset = { audioId: string; lawId: number; active: boolean; publishedAt: string | null; primaryId: number | null };
type AssetCertificate = Omit<AudioAsset, "active" | "publishedAt" | "primaryId"> & {
  object: ImmutablePlaybackObject;
  coveredStructureIds: readonly number[];
  approvedAt: string | null;
  revokedAt: string | null;
};

export function certifiedPlaybackTarget(input: {
  audio: AudioAsset;
  certificate: AssetCertificate | null;
  pinnedPlaybackObject: ImmutablePlaybackObject | null;
  fullyContainedIds: ReadonlySet<number>;
}): ImmutablePlaybackObject | null {
  const { audio, certificate, pinnedPlaybackObject: object, fullyContainedIds } = input;
  if (!audio.active || !audio.publishedAt || !certificate?.approvedAt || certificate.revokedAt ||
    certificate.audioId !== audio.audioId || certificate.lawId !== audio.lawId || !object ||
    !object.bucket || !object.key || !object.version || certificate.object.bucket !== object.bucket ||
    certificate.object.key !== object.key || certificate.object.version !== object.version) return null;
  return audioFullyContained({ primaryId: audio.primaryId, explicitCoverageIds: certificate.coveredStructureIds, fullyContainedIds }) ? object : null;
}
