export type CampaignScore = { score: number | null; score_ajustado?: number | null; score_version?: number };
export type PersonalRecordStatus = "first_record" | "new_record" | "matched_record" | "record_remains";

export type PersonalRecord = {
  previousBest: number | null;
  currentBest: number;
  status: PersonalRecordStatus;
};

export function effectiveCampaignScore(campaign: CampaignScore) {
  if (campaign.score_version !== undefined && campaign.score_version !== 2) return null;
  return typeof campaign.score_ajustado === "number" ? campaign.score_ajustado : campaign.score;
}

export type CompletedCampaignForRecord = CampaignScore & {
  id: string;
  concluida_em: string | null;
  total_erros: number;
  score_competitivo_acertos?: number | null;
  score_competitivo_erros?: number | null;
};

/** A mesma prioridade do recorde/ranking: score efetivo, conclusão mais antiga e ID estável. */
export function bestCompletedCampaignForRecord(campaigns: CompletedCampaignForRecord[]) {
  return campaigns
    .filter((campaign): campaign is CompletedCampaignForRecord & { score: number } => typeof effectiveCampaignScore(campaign) === "number")
    .sort((left, right) => {
      const scoreDifference = effectiveCampaignScore(right)! - effectiveCampaignScore(left)!;
      if (scoreDifference) return scoreDifference;
      const completedDifference = (left.concluida_em ?? "").localeCompare(right.concluida_em ?? "");
      return completedDifference || left.id.localeCompare(right.id);
    })[0] ?? null;
}

/** Compara uma tentativa concluída com o histórico anterior da mesma lei. */
export function personalRecordForAttempt(currentScore: number, previousCampaigns: CampaignScore[]): PersonalRecord {
  const previousScores = previousCampaigns.map(effectiveCampaignScore).filter((score): score is number => typeof score === "number");
  const previousBest = previousScores.length ? Math.max(...previousScores) : null;
  const currentBest = Math.max(currentScore, previousBest ?? currentScore);
  const status: PersonalRecordStatus = previousBest === null ? "first_record" : currentScore > previousBest ? "new_record" : currentScore === previousBest ? "matched_record" : "record_remains";
  return { previousBest, currentBest, status };
}
