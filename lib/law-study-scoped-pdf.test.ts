import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase-server", () => ({ getSupabaseServerClient: vi.fn() }));
vi.mock("@/lib/question-counts-server", () => ({ activeQuestionCountBySlug: vi.fn().mockResolvedValue(3) }));
import { loadLawStudy } from "./law-study-server";

const material = { ativo: true, provedor: "google_drive", acao: "baixar", url_externa: "https://drive.google.com/file/d/testing12345678/view" };
const request = new Request("https://www.legisflashcards.com.br/api/aluno/estudar/lei/l13146");
function harness(includeFullPdf: boolean, scoped = true) {
  const materials = {
    select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), order: vi.fn().mockReturnThis(),
    then: (resolve: (data: unknown) => unknown) => Promise.resolve(resolve({ data: [
      { ...material, id: 10, tipo: "pdf", titulo: "PDF integral" },
      { ...material, id: 11, tipo: "flashcards", titulo: "Deck inteiro" },
      { ...material, id: 12, tipo: "audio", titulo: "Áudio integral" },
    ], error: null })),
  };
  const history = { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), order: vi.fn().mockReturnThis(), then: (resolve: (data: unknown) => unknown) => Promise.resolve(resolve({ data: [], error: null })) };
  const progress = { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }) };
  const from = vi.fn((name: string) => name === "materiais_leis" ? materials : name === "historico_atualizacoes_leis" ? history : progress);
  const context = { supabase: { from }, lawId: 30, studentId: "aluno-teste", title: "LBI", law: {},
    recorte: scoped ? { id: "recorte-tjsp", nome: "TJSP" } : null, includeFullPdf, questionIds: ["q1", "q2"] };
  return { context: context as unknown as Parameters<typeof loadLawStudy>[2], from, materials };
}

describe("PDF integral com acesso autorizado", () => {
  it("mostra apenas PDF no recorte, com URL do Drive oculta", async () => {
    const h = harness(true);
    const study = await loadLawStudy(request, "l13146", h.context);
    expect(h.materials.eq).toHaveBeenCalledWith("tipo", "pdf");
    expect(study.materials.map((x) => x.type)).toEqual(["pdf"]);
    expect(study.materials[0]).toMatchObject({ id: 10, accessAvailable: true, accessUrl: null });
    expect(study.law.totalFlashcards).toBe(2);
  });
  it("não carrega PDF integral para acesso somente à amostra", async () => {
    const h = harness(false);
    const study = await loadLawStudy(request, "l13146", h.context);
    expect(h.from).not.toHaveBeenCalledWith("materiais_leis");
    expect(study.materials).toEqual([]);
  });
  it("mantém todos os materiais na lei completa", async () => {
    const h = harness(false, false);
    const study = await loadLawStudy(request, "l13146", h.context);
    expect(h.materials.eq).not.toHaveBeenCalledWith("tipo", "pdf");
    expect(study.materials.map((x) => x.type)).toEqual(["pdf", "flashcards", "audio"]);
  });
});
