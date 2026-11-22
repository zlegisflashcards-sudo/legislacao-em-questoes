export type LegiscastFreshnessTrack = {
  ativo: boolean;
  publicado_em?: string | null;
  created_at?: string | null;
  situacao_atualizacao_manual?: "atual" | "desatualizado" | null;
  situacao_atualizacao_em?: string | null;
  situacao_atualizacao_alteracao_data?: string | null;
};

export type LegiscastTrackFreshness = "current" | "outdated" | "inactive";
export type LegiscastStructureFreshness = "current" | "outdated" | "none";

function isoDate(value: string | null | undefined) {
  const normalized = String(value ?? "").slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(normalized) ? normalized : null;
}

/**
 * A atualização global da lei é informativa: só a alteração explícita do
 * bloco/artigo coberto pode deixar seu áudio automaticamente desatualizado.
 */
export function legiscastTrackFreshness(
  track: LegiscastFreshnessTrack,
  blockChangedAt?: string | null,
): LegiscastTrackFreshness {
  if (!track.ativo) return "inactive";
  if (track.situacao_atualizacao_manual === "desatualizado") return "outdated";

  const blockChangeDate = isoDate(blockChangedAt);
  if (
    track.situacao_atualizacao_manual === "atual" &&
    (!blockChangeDate || (isoDate(track.situacao_atualizacao_em) ?? "") >= blockChangeDate)
  ) {
    return "current";
  }

  const insertedAt = isoDate(track.created_at) ?? isoDate(track.publicado_em);
  return blockChangeDate && (!insertedAt || insertedAt < blockChangeDate)
    ? "outdated"
    : "current";
}

export function legiscastStructureFreshness(
  tracks: readonly LegiscastFreshnessTrack[],
  blockChangedAt?: string | null,
): LegiscastStructureFreshness {
  const activeTracks = tracks.filter((track) => track.ativo);
  if (!activeTracks.length) return "none";
  return activeTracks.some((track) => legiscastTrackFreshness(track, blockChangedAt) === "current")
    ? "current"
    : "outdated";
}
