export function reviewQuestionIds(questionIds: string[], historyIds: string[], activeCampaignWrongIds: string[], favoriteIds: string[]) {
  const available = new Set(questionIds); const answered = new Set(historyIds.filter((id) => available.has(id))); const errors = new Set(activeCampaignWrongIds.filter((id) => available.has(id))); const favorites = new Set(favoriteIds.filter((id) => available.has(id)));
  return { errors, favorites, unanswered: new Set(questionIds.filter((id) => !answered.has(id))) };
}
