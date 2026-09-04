export function legiscastPdfPositionKey(slug: string, recorteId: string | null) {
  return `legiscast-pdf-position:${slug}:${recorteId || "completo"}`;
}

export function normalizeLegiscastPdfPage(value: number, total: number) {
  return Number.isSafeInteger(value) && value > 0 && total > 0 ? Math.min(value, total) : 1;
}
