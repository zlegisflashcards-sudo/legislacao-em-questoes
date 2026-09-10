export type LegiscastPdfFailureCode =
  | "material_not_found"
  | "unauthorized"
  | "forbidden"
  | "pdf_fetch_failed"
  | "invalid_content_type"
  | "empty_pdf"
  | "pdfjs_load_failed";

export class LegiscastPdfError extends Error {
  constructor(public readonly code: LegiscastPdfFailureCode, message: string, public readonly details: Record<string, string | number | boolean | null> = {}) {
    super(message);
    this.name = "LegiscastPdfError";
  }
}

export function authorizedLegiscastPdfPath(slug: string, materialId: number, recorteId: string | null) {
  const base = `/api/aluno/estudar/lei/${encodeURIComponent(slug)}/materiais/${materialId}/download`;
  return recorteId ? `${base}?recorte_id=${encodeURIComponent(recorteId)}` : base;
}

export function pdfFailureForHttpStatus(status: number): LegiscastPdfFailureCode {
  if (status === 401) return "unauthorized";
  if (status === 403) return "forbidden";
  if (status === 404) return "material_not_found";
  return "pdf_fetch_failed";
}

export function validateLegiscastPdfBytes(contentType: string | null, bytes: ArrayBuffer) {
  const normalizedContentType = contentType?.split(";", 1)[0]?.trim().toLowerCase() ?? null;
  if (normalizedContentType?.includes("text/html") || normalizedContentType?.includes("application/json")) {
    throw new LegiscastPdfError("invalid_content_type", "A resposta não contém um PDF.", { contentType: normalizedContentType, size: bytes.byteLength });
  }
  if (bytes.byteLength === 0) throw new LegiscastPdfError("empty_pdf", "O PDF retornou vazio.", { contentType: normalizedContentType, size: 0 });
  const prefix = new TextDecoder("ascii").decode(bytes.slice(0, Math.min(bytes.byteLength, 1024)));
  if (!prefix.includes("%PDF-")) {
    throw new LegiscastPdfError("invalid_content_type", "A resposta não contém bytes válidos de PDF.", { contentType: normalizedContentType, size: bytes.byteLength });
  }
}
