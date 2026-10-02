export type StudyContextOption = { recorteId: string | null };

/** A rota principal prioriza a lei completa quando ela está liberada; um
 * recorte continua exigindo seu `recorte_id` explícito. */
export function selectLawStudyContext<T extends StudyContextOption>(contexts: T[], requestedScopeId: string | null, _requestedFullContext = false) {
  if (contexts.length === 1) return contexts[0];
  if (requestedScopeId) return contexts.find((context) => context.recorteId === requestedScopeId) ?? null;
  return contexts.find((context) => context.recorteId === null) ?? null;
}

export function mustChooseLawStudyContext<T extends StudyContextOption>(contexts: T[], requestedScopeId: string | null, requestedFullContext = false) {
  return contexts.length > 1 && !selectLawStudyContext(contexts, requestedScopeId, requestedFullContext);
}

/** O seletor é um fallback para URLs que ainda não declaram um contexto. */
export function shouldShowLawStudyContextSelector<T extends StudyContextOption>(contexts: T[], requestedScopeId: string | null, requestedFullContext = false) {
  return mustChooseLawStudyContext(contexts, requestedScopeId, requestedFullContext);
}
