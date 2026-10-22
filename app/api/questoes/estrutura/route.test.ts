import { describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ questionRanges: [] as Array<[number, number]>, questions: Array.from({ length: 2024 }, (_, index) => ({ id: `q-${index}`, lei_id: 1, structure_id: index < 1000 ? 10 : 20 })) }));
vi.mock("@/lib/student-laws-server", () => ({ loadStudentLaws: async () => [{ id: 1, slug: "cf" }], studentLawsErrorResponse: (error: unknown) => { throw error; } }));
vi.mock("@/lib/student-laws", () => ({ uniqueStudentLawsById: (laws: unknown) => laws }));
vi.mock("@/lib/supabase-server", () => ({ getSupabaseServerClient: () => ({ from: (table: string) => {
  const query: Record<string, unknown> = { select: () => query, in: () => query, eq: () => query, order: () => query, range: (from: number, to: number) => {
    if (table === "questions") state.questionRanges.push([from, to]);
    const rows = table === "questions" ? state.questions.slice(from, to + 1) : [{ id: 10, lei_id: 1, parent_id: null, nome: "Título I", ordem: 1 }, { id: 20, lei_id: 1, parent_id: null, nome: "Título IX", ordem: 9 }].slice(from, to + 1);
    Object.assign(query, { then: (resolve: (value: unknown) => unknown) => resolve({ data: rows, error: null }) }); return query;
  } }; return query; } }) }));

import { GET } from "./route";

describe("rota real da estrutura de estudo", () => {
  it("entrega todas as 2.024 questões para a árvore, além do teto de 1.000", async () => {
    state.questionRanges = [];
    const response = await GET(new Request("https://site.test/api/questoes/estrutura?slug=cf"));
    const body = await response.json();
    expect(body.laws[0].questions).toHaveLength(2024);
    expect(body.laws[0].questions.filter((question: { structure_id: number }) => question.structure_id === 10)).toHaveLength(1000);
    expect(body.laws[0].questions.filter((question: { structure_id: number }) => question.structure_id === 20)).toHaveLength(1024);
    expect(state.questionRanges).toEqual([[0, 499], [500, 999], [1000, 1499], [1500, 1999], [2000, 2499]]);
  });
});
