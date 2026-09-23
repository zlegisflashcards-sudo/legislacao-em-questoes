export type ReviewCampaignLevel = { ordem: number; questoesIds: string[]; concluido: boolean };

/** Questões novas em níveis efetivamente anteriores ao nível atual da campanha. */
export function pendingQuestionIds(levels: ReviewCampaignLevel[], campaignCompleted: boolean) {
  const ordered = [...levels].sort((left, right) => left.ordem - right.ordem);
  const currentIndex = ordered.findIndex((level) => !level.concluido);
  const previousLevels = currentIndex >= 0 ? ordered.slice(0, currentIndex) : campaignCompleted ? ordered : [];
  return new Set(previousLevels.flatMap((level) => level.questoesIds));
}

export function reviewQuestionIds(questionIds: string[], historyIds: string[], activeCampaignWrongIds: string[], favoriteIds: string[], pendingIds: Iterable<string> = questionIds) {
  const available = new Set(questionIds); const answered = new Set(historyIds.filter((id) => available.has(id))); const errors = new Set(activeCampaignWrongIds.filter((id) => available.has(id))); const favorites = new Set(favoriteIds.filter((id) => available.has(id)));
  const pending = new Set([...pendingIds].filter((id) => available.has(id) && !answered.has(id)));
  return { errors, favorites, unanswered: pending };
}
