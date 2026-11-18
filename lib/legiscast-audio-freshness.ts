export type LegiscastFreshnessLaw = {
  houve_alteracao_legislativa?: boolean | null;
  ultima_alteracao_data?: string | null;
};

export type LegiscastFreshnessTrack = {
  ativo: boolean;
  publicado_em?: string | null;
  situacao_atualizacao_manual?: "atual" | "desatualizado" | null;
  situacao_atualizacao_alteracao_data?: string | null;
};

export type LegiscastTrackFreshness = "current" | "outdated" | "inactive";
export type LegiscastStructureFreshness = "current" | "outdated" | "none";

function isoDate(value: string | null | undefined) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(value ?? ""))
    ? String(value)
    : null;
}

export function legislativeChangeDateForLegiscast(law: LegiscastFreshnessLaw) {
  return law.houve_alteracao_legislativa === true
    ? isoDate(law.ultima_alteracao_data)
    : null;
}

/**
 * A confirmação manual de revisão só vale para a alteração que ela registrou.
 * Assim, uma nova alteração na lei volta a exigir avaliação sem apagar o
 * histórico editorial do áudio.
 */
export function legiscastTrackFreshness(
  track: LegiscastFreshnessTrack,
  law: LegiscastFreshnessLaw,
): LegiscastTrackFreshness {
  if (!track.ativo) return "inactive";
  if (track.situacao_atualizacao_manual === "desatualizado") return "outdated";

  const changeDate = legislativeChangeDateForLegiscast(law);
  if (
    track.situacao_atualizacao_manual === "atual" &&
    (!changeDate || isoDate(track.situacao_atualizacao_alteracao_data) === changeDate)
  ) {
    return "current";
  }

  const publicationDate = isoDate(track.publicado_em);
  return changeDate && (!publicationDate || publicationDate < changeDate)
    ? "outdated"
    : "current";
}

export function legiscastStructureFreshness(
  tracks: readonly LegiscastFreshnessTrack[],
  law: LegiscastFreshnessLaw,
): LegiscastStructureFreshness {
  const activeTracks = tracks.filter((track) => track.ativo);
  if (!activeTracks.length) return "none";
  return activeTracks.some((track) => legiscastTrackFreshness(track, law) === "current")
    ? "current"
    : "outdated";
}
