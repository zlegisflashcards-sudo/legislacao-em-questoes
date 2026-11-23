import { describe, expect, it, vi } from "vitest";
const fixtures = vi.hoisted(() => ({ authorize: vi.fn(), questions: vi.fn(), structure: vi.fn(), db: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase-server", () => ({ getSupabaseServerClient: fixtures.db }));
vi.mock("@/lib/law-question-scope-auth", () => ({ authorizeLawQuestionScope: fixtures.authorize }));
vi.mock("@/lib/questions-main-server", () => ({ mainStructure: fixtures.structure, mainQuestions: fixtures.questions }));
vi.mock("@/lib/legisbot/continuous-reading-server", () => ({ getContinuousQuestionDestinations: () => new Map() }));
import { GET } from "@/app/api/aluno/estudar/lei/[slug]/anki/download/route";
import { parseLegisApkg } from "./anki-apkg-import";

const scopeId = "10000000-0000-4000-8000-000000000050";
const scopeStructure = [{ id: 438, parent_id: null, nome: "Arts. 1–4" }, { id: 166, parent_id: null, nome: "Art. 5" }, { id: 439, parent_id: null, nome: "Arts. 6–11" }];
const distribution = [3, 1, 3, 5, 190];
const expected = distribution.flatMap((count, idx) => Array.from({ length: count }, (_, n) => {
  const artigo = String(idx + 1).padStart(4, "0");
  return { id: `fake-note-${idx}-${n}`, structure_id: idx === 4 ? 166 : 438, ordem: `${artigo}.0.00.0.00.0`, resposta: "Certo", pergunta: `Questão fictícia ${idx}-${n}` };
}));

function dbFixture() {
  fixtures.authorize.mockResolvedValue({ lawId: 14, title: "Constituição Federal", law: {} });
  fixtures.questions.mockResolvedValue([...expected, { id: "outside-note", structure_id: 439, ordem: "0006.0.00.0.00.0", resposta: "Certo", pergunta: "Arts. 6 a 11" }]);
  fixtures.structure.mockResolvedValue(scopeStructure);
  fixtures.db.mockReturnValue({ from(table: string) {
    const value = table === "recortes_leis" ? { id: scopeId, lei_id: 14 } : [{ structure_id: 438 }, { structure_id: 166 }];
    const query = { select() { return query; }, eq() { return query; }, maybeSingle: async () => ({ error: null, data: value }),
      then: (fn: (result: { error: null; data: unknown }) => unknown) => Promise.resolve({ error: null, data: value }).then(fn) };
    return query;
  } });
}

describe("round-trip do APKG com perfil da amostra CF", () => {
  it("baixa o ZIP real, lê a base de notas e confirma as 202 ordens/IDs sem art.6", async () => {
    dbFixture();
    const route = { params: Promise.resolve({ slug: "cf" }) };
    const response = await GET(new Request(`https://example.invalid/anki/download?recorte_id=${scopeId}`), route);
    expect(response.status).toBe(200);
    const parsed = await parseLegisApkg(Buffer.from(await response.arrayBuffer()));
    expect(parsed.rows).toHaveLength(202);
    expect(new Map(parsed.rows.map(({ id_questao, ordem }) => [id_questao, ordem]))).toEqual(new Map(expected.map(({ id, ordem }) => [id, ordem])));
    const counts = distribution.map((_, i) => parsed.rows.filter((row) => Number(row.ordem?.split(".")[0]) === i + 1).length);
    expect(counts).toEqual(distribution);
    expect(parsed.rows.some(({ id_questao }) => id_questao === "outside-note")).toBe(false);
    const full = await GET(new Request("https://example.invalid/anki/download"), route);
    const parsedFull = await parseLegisApkg(Buffer.from(await full.arrayBuffer()));
    expect(parsedFull.rows).toHaveLength(203);
    expect(parsedFull.rows.some(({ id_questao }) => id_questao === "outside-note")).toBe(true);
  });
});
