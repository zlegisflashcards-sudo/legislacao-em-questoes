import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { isPdfHighlightAnchor } from "./legiscast-pdf-highlight";

const migration = readFileSync("supabase/migrations/20260911170000_create_pdf_highlights.sql", "utf8");
const server = readFileSync("lib/legiscast-pdf-highlights-server.ts", "utf8");
const viewer = readFileSync("components/legiscast-pdf-viewer.tsx", "utf8");
const listRoute = readFileSync("app/api/aluno/estudar/lei/[slug]/materiais/[materialId]/highlights/route.ts", "utf8");
const deleteRoute = readFileSync("app/api/aluno/estudar/lei/[slug]/materiais/[materialId]/highlights/[highlightId]/route.ts", "utf8");

describe("marca-texto pessoal do PDF do LegisCast", () => {
  it("valida âncoras normalizadas e rejeita coordenadas fora da página", () => {
    expect(isPdfHighlightAnchor({ version: 1, rects: [{ x: 0.1, y: 0.2, width: 0.3, height: 0.04 }] })).toBe(true);
    expect(isPdfHighlightAnchor({ version: 1, rects: [{ x: 0.9, y: 0.2, width: 0.3, height: 0.04 }] })).toBe(false);
    expect(isPdfHighlightAnchor({ version: 1, rects: [] })).toBe(false);
  });

  it("cria tabela vinculada ao usuário e material bigint com RLS própria", () => {
    expect(migration).toContain("create table if not exists public.pdf_highlights");
    expect(migration).toContain("user_id uuid not null references auth.users(id)");
    expect(migration).toContain("material_id bigint not null references public.materiais_leis(id)");
    expect(migration).toContain("anchor_data jsonb not null");
    expect(migration).toContain("user_id = auth.uid()");
    expect(migration).toContain("pdf_highlights_select_own");
    expect(migration).toContain("pdf_highlights_insert_own");
    expect(migration).toContain("pdf_highlights_delete_own");
  });

  it("autoriza a lei e restringe listagem, criação e remoção ao material aberto", () => {
    expect(server).toContain("await authorizeLawStudy(request, slug)");
    expect(server).toContain('.eq("lei_id", access.lawId)');
    expect(server).toContain('.eq("tipo", "pdf")');
    expect(server).toContain("createSupabaseUserClient(token(request))");
    expect(server).toContain('.eq("material_id", id)');
    expect(server).toContain("user_id: userId");
    expect(listRoute).toContain("listPdfHighlights");
    expect(listRoute).toContain("createPdfHighlight");
    expect(deleteRoute).toContain("deletePdfHighlight");
  });

  it("ancora por retângulos da seleção, não apenas pelo texto repetível", () => {
    expect(viewer).toContain("range.getClientRects()");
    expect(viewer).toContain("(rect.left - bounds.left) / bounds.width");
    expect(viewer).toContain("anchor: { version: 1, rects }");
    expect(viewer).toContain("selectedText");
  });

  it("reaplica destaques após render e zoom sem bloquear PDF sem text layer", () => {
    expect(viewer).toContain('[highlights, status, zoom]');
    expect(viewer).toContain("rect.x * 100");
    expect(viewer).toContain("catch { textLayer.remove(); }");
    expect(viewer).toContain("legiscast_pdf_highlights_unavailable");
    expect(viewer).toContain("setHighlightingAvailable(false)");
  });

  it("oferece somente destacar em amarelo e remoção simples", () => {
    expect(viewer).toContain("🖍 Destacar");
    expect(viewer).toContain("Remover destaque");
    expect(viewer).toContain("bg-yellow-300/45");
    expect(viewer).not.toContain("highlightColor");
  });

  it("mantém material e recorte no fluxo autorizado do mesmo viewer fullscreen", () => {
    expect(viewer).toContain("authorizedLegiscastPdfPath(slug, materialId, recorteId)");
    expect(viewer).toContain("highlightsPath(slug, materialId)");
  });
});
