import { describe, expect, it } from "vitest";
import { authorizedLegiscastPdfPath, LegiscastPdfError, pdfFailureForHttpStatus, validateLegiscastPdfBytes } from "./legiscast-pdf";

function bytes(value: string) { return new TextEncoder().encode(value).buffer; }

describe("PDF autorizado do LegisCast", () => {
  it("preserva recorte_id no endpoint autorizado", () => {
    expect(authorizedLegiscastPdfPath("lei teste", 42, "recorte-1")).toBe("/api/aluno/estudar/lei/lei%20teste/materiais/42/download?recorte_id=recorte-1");
    expect(authorizedLegiscastPdfPath("lei", 42, null)).toBe("/api/aluno/estudar/lei/lei/materiais/42/download");
  });

  it("classifica respostas HTTP do endpoint", () => {
    expect(pdfFailureForHttpStatus(401)).toBe("unauthorized");
    expect(pdfFailureForHttpStatus(403)).toBe("forbidden");
    expect(pdfFailureForHttpStatus(404)).toBe("material_not_found");
    expect(pdfFailureForHttpStatus(503)).toBe("pdf_fetch_failed");
  });

  it("aceita bytes PDF e rejeita JSON, HTML e corpo vazio", () => {
    expect(() => validateLegiscastPdfBytes("application/pdf", bytes("%PDF-1.7\\nconteúdo"))).not.toThrow();
    for (const [type, body, code] of [["application/json", "{}", "invalid_content_type"], ["text/html", "<html>", "invalid_content_type"], ["application/pdf", "", "empty_pdf"], ["application/octet-stream", "não é pdf", "invalid_content_type"]] as const) {
      try { validateLegiscastPdfBytes(type, bytes(body)); throw new Error("era esperado falhar"); } catch (error) { expect(error).toBeInstanceOf(LegiscastPdfError); expect((error as LegiscastPdfError).code).toBe(code); }
    }
  });
});
