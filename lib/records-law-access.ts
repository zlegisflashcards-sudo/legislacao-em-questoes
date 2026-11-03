export function recordsStudyHref(slug: string, contexts: ReadonlyArray<{ recorteId: string | null; availability?: "ready" | "coming_soon" }>, preferredRecorteId: string | null = null): string | null {
  const ready = contexts.filter((item) => item.availability !== "coming_soon");
  const context = (preferredRecorteId ? ready.find((item) => item.recorteId === preferredRecorteId) : null) ?? ready.find((item) => item.recorteId === null) ?? ready[0];
  if (!context) return null;
  const base = `/estudar/lei/${encodeURIComponent(slug)}`;
  return context.recorteId === null ? base : `${base}?recorte_id=${encodeURIComponent(context.recorteId)}`;
}
