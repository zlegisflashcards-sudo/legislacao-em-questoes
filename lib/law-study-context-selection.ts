export type StudyContextOption = { recorteId: string | null };

/**
 * Um recorte só é escolhido quando a URL o declara explicitamente. A ausência
 * de `recorte_id` não pode significar "lei completa" se houver alternativas.
 */
export function selectLawStudyContext<T extends StudyContextOption>(contexts: T[], requestedScopeId: string | null, requestedFullContext = false) {
  if (contexts.length === 1) return contexts[0];
  if (requestedScopeId) return contexts.find((context) => context.recorteId === requestedScopeId) ?? null;
  return requestedFullContext ? contexts.find((context) => context.recorteId === null) ?? null : null;
}

export function mustChooseLawStudyContext<T extends StudyContextOption>(contexts: T[], requestedScopeId: string | null, requestedFullContext = false) {
  return contexts.length > 1 && !selectLawStudyContext(contexts, requestedScopeId, requestedFullContext);
}
