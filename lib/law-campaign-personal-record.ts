export type CampaignScore = { score: number | null; score_ajustado?: number | null };
export type PersonalRecordStatus = "first_record" | "new_record" | "matched_record" | "record_remains";

export type PersonalRecord = {
  previousBest: number | null;
  currentBest: number;
  status: PersonalRecordStatus;
};

export function effectiveCampaignScore(campaign: CampaignScore) {
  return typeof campaign.score_ajustado === "number" ? campaign.score_ajustado : campaign.score;
}

/** Compara uma tentativa concluída com o histórico anterior da mesma lei. */
export function personalRecordForAttempt(currentScore: number, previousCampaigns: CampaignScore[]): PersonalRecord {
  const previousScores = previousCampaigns.map(effectiveCampaignScore).filter((score): score is number => typeof score === "number");
  const previousBest = previousScores.length ? Math.max(...previousScores) : null;
  const currentBest = Math.max(currentScore, previousBest ?? currentScore);
  const status: PersonalRecordStatus = previousBest === null ? "first_record" : currentScore > previousBest ? "new_record" : currentScore === previousBest ? "matched_record" : "record_remains";
  return { previousBest, currentBest, status };
}
