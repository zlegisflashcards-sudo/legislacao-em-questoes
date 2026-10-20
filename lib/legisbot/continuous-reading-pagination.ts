/**
 * Estado local de paginação: uma resposta bem-sucedida encerra aquela página,
 * mesmo se algum bloco não tiver HTML. Falhas não entram no conjunto para que
 * o retry explícito continue possível.
 */
export function canLoadContinuousPage(input: { page: number; preparedCount: number; pageSize: number; loadedPages: ReadonlySet<number>; loadingPages: ReadonlySet<number> }) {
  return Number.isSafeInteger(input.page)
    && input.page >= 0
    && input.page * input.pageSize < input.preparedCount
    && !input.loadedPages.has(input.page)
    && !input.loadingPages.has(input.page);
}

export function completedContinuousPage(current: ReadonlySet<number>, page: number) {
  const next = new Set(current);
  next.add(page);
  return next;
}
