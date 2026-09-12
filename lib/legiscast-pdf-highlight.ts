export type PdfHighlightRect = { x: number; y: number; width: number; height: number };
export type PdfHighlightAnchor = { version: 1; rects: PdfHighlightRect[] };
export type PdfHighlight = { id: string; page: number; selectedText: string; anchor: PdfHighlightAnchor };

export function isPdfHighlightAnchor(value: unknown): value is PdfHighlightAnchor {
  if (!value || typeof value !== "object") return false;
  const anchor = value as { version?: unknown; rects?: unknown };
  if (anchor.version !== 1 || !Array.isArray(anchor.rects) || !anchor.rects.length || anchor.rects.length > 100) return false;
  return anchor.rects.every((rect) => {
    if (!rect || typeof rect !== "object") return false;
    const item = rect as Record<string, unknown>;
    return [item.x, item.y, item.width, item.height].every((number) => typeof number === "number" && Number.isFinite(number))
      && Number(item.x) >= 0 && Number(item.y) >= 0 && Number(item.width) > 0 && Number(item.height) > 0
      && Number(item.x) + Number(item.width) <= 1.001 && Number(item.y) + Number(item.height) <= 1.001;
  });
}
