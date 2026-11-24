// An explicit scope is never interpreted as authorization for integral audio.
// Presence, not truthiness, catches empty and repeated query parameters too.
export function rejectUncertifiedLegiscastScope(request: Request): Response | null {
  if (!new URL(request.url).searchParams.has("recorte_id")) return null;
  return Response.json({ status: "coverage_pending", message: "As faixas específicas deste recorte ainda não estão disponíveis." }, {
    status: 403,
    headers: { "Cache-Control": "private, no-store, max-age=0" },
  });
}
