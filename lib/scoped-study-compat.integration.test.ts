import { describe, expect, it, vi } from "vitest";

const fixtures = vi.hoisted(() => ({
  db: vi.fn(), full: vi.fn(), authorize: vi.fn(), scopeQuestions: vi.fn(), exportDeck: vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase-server", () => ({ getSupabaseServerClient: fixtures.db }));
vi.mock("@/lib/law-study-server", () => {
  class E extends Error { constructor(public status: number, message: string) { super(message); } }
  return { LawStudyApiError: E, authorizeLawStudy: fixtures.full,
    lawStudyErrorResponse: (e: E) => Response.json({ message: e.message }, { status: e.status }) };
});
vi.mock("@/lib/law-question-scope-auth", () => ({ authorizeLawQuestionScope: fixtures.authorize }));
vi.mock("@/lib/law-question-scopes", () => ({ resolveQuestionsForLawScope: fixtures.scopeQuestions }));
vi.mock("@/lib/anki-apkg-export", () => ({ buildLawApkg: fixtures.exportDeck }));
vi.mock("@/lib/questions-main-server", () => ({ mainStructure: () => [], mainQuestions: () => [] }));
vi.mock("@/lib/legisbot/continuous-reading-server", () => ({ getContinuousQuestionDestinations: () => new Map() }));
import { GET as anki } from "@/app/api/aluno/estudar/lei/[slug]/anki/download/route";
import { GET as pdf } from "@/app/api/aluno/estudar/lei/[slug]/materiais/[materialId]/download/route";
import { LawStudyApiError } from "./law-study-server";

const scopeId = "10000000-0000-4000-8000-000000000050";
const ankiParams = { params: Promise.resolve({ slug: "cf" }) };
const pdfParams = { params: Promise.resolve({ slug: "cf", materialId: "5" }) };
const approved = [{ id: "art1-note", structure_id: 438 }, { id: "art5-note", structure_id: 166 }];
const integrated = [...approved, { id: "art6-note", structure_id: 439 }];
const endpoint = "https://test.invalid";

describe("compatibilidade: Anki usa o universo atual do recorte e PDF permanece integral", () => {
  it("envia ao exportador apenas notas resolvidas e mantém o caminho integral separado", async () => {
    fixtures.authorize.mockResolvedValue({ title: "CF", lawId: 14 });
    fixtures.scopeQuestions.mockImplementation((_lawId, selected) => selected === scopeId ? approved : integrated);
    fixtures.exportDeck.mockResolvedValue({ bytes: new Uint8Array([80, 75]), filename: "test.apkg" });
    const scoped = await anki(new Request(`${endpoint}/anki/download?recorte_id=${scopeId}`), ankiParams);
    expect(scoped.headers.get("content-type")).toBe("application/vnd.anki");
    expect(fixtures.authorize).toHaveBeenLastCalledWith(expect.any(Request), "cf", scopeId);
    expect(fixtures.scopeQuestions).toHaveBeenLastCalledWith(14, scopeId);
    expect(fixtures.exportDeck.mock.lastCall?.[1]).toEqual(approved);
    const full = await anki(new Request(`${endpoint}/anki/download`), ankiParams);
    expect(full.status).toBe(200);
    expect(fixtures.authorize).toHaveBeenLastCalledWith(expect.any(Request), "cf", null);
    expect(fixtures.exportDeck.mock.lastCall?.[1]).toEqual(integrated);
  });

  it("não monta pacote se o recorte for negado", async () => {
    fixtures.exportDeck.mockClear();
    fixtures.authorize.mockRejectedValueOnce(new LawStudyApiError(403, "Sem acesso"));
    const res = await anki(new Request(`${endpoint}/anki/download?recorte_id=${scopeId}`), ankiParams);
    expect(res.status).toBe(403);
    expect(fixtures.exportDeck).not.toHaveBeenCalled();
  });

  it("PDF não usa recorte, nega aluno de amostra e entrega bytes integrais à conta autorizada", async () => {
    const inline = "%PDF-1.4\nPARTE INICIAL\nART 6 INTEGRAL";
    const fakeFetch = globalThis.fetch;
    const upstream = new Response(inline, { headers: { "content-type": "application/pdf" } });
    Object.defineProperty(upstream, "url", { value: "https://drive.google.com/uc?export=download" });
    const response = { error: null, data: { id: 5, lei_id: 14, tipo: "pdf", titulo: "CF integral", provedor: "google_drive", url_externa: "https://drive.google.com/file/d/abcdefghijklmno/view", acao: "baixar", ativo: true } };
    const q = { select() { return q; }, eq() { return q; }, maybeSingle: async () => response };
    const db = { from: vi.fn(() => q) };
    try {
      globalThis.fetch = vi.fn(async () => upstream);
      fixtures.full.mockRejectedValueOnce(new LawStudyApiError(404, "Sem liberação integral"));
      const onlySample = await pdf(new Request(`${endpoint}/download?recorte_id=${scopeId}`), pdfParams);
      expect(onlySample.status).toBe(404);
      expect(globalThis.fetch).not.toHaveBeenCalled();
      fixtures.full.mockResolvedValueOnce({ supabase: db, lawId: 14, title: "CF" });
      const full = await pdf(new Request(`${endpoint}/download`), pdfParams);
      expect(full.status).toBe(200);
      expect(full.headers.get("content-type")).toBe("application/pdf");
      expect(await full.text()).toBe(inline);
    } finally { globalThis.fetch = fakeFetch; }
  });
});
