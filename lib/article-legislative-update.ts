export const UPDATE_STEPS = ["legislacao", "questoes_artigo", "questoes_outros_artigos", "legisbot", "legiscast", "materiais_relacionados"] as const;
export type UpdateStep = typeof UPDATE_STEPS[number];

export function canConcludeLegislativeUpdate(status: string, completedSteps: Iterable<string>) {
  return status !== "concluida" && new Set(completedSteps).size === UPDATE_STEPS.length && UPDATE_STEPS.every((step) => new Set(completedSteps).has(step));
}
