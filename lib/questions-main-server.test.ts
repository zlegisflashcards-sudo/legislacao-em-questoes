import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildLawApkg } from "./anki-apkg-export";
import { questionsInScope } from "./law-question-scope-resolution";

const state = vi.hoisted(() => ({ questions: [] as Array<Record<string, unknown>>, ranges: [] as Array<[number, number]>, idBatches: [] as string[][], failingPage: null as number | null }));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase-server", () => ({
  getSupabaseServerClient: () => ({
    from: (table: string) => {
      let selectedIds: string[] | null = null;
      const query: Record<string, unknown> = {
        select: () => query,
        eq: () => query,
        order: () => query,
        in: (_field: string, ids: string[]) => { selectedIds = ids; state.idBatches.push(ids); return query; },
        range: (from: number, to: number) => {
          state.ranges.push([from, to]);
          Object.assign(query, { then: (resolve: (value: unknown) => unknown) => resolve(state.failingPage === from ? { data: null, error: { message: "page failure" } } : { data: state.questions.slice(from, to + 1), error: null }) });
          return query;
        },
        then: (resolve: (value: unknown) => unknown) => resolve({ data: state.questions.filter((question) => !selectedIds || selectedIds.includes(String(question.id))), error: null }),
      };
      if (table !== "questions") throw new Error(`Unexpected table: ${table}`);
      return query;
    },
  }),
}));

import { mainQuestions, mainQuestionsByIds } from "./questions-main-server";

describe("consultas principais de questoes", () => {
  beforeEach(() => {
    state.questions = Array.from({ length: 2024 }, (_, index) => ({ id: `question-${String(index + 1).padStart(4, "0")}`, ordem: String(index + 1) }));
    state.ranges = [];
    state.idBatches = [];
    state.failingPage = null;
  });

  it("pagina a lei completa acima do teto da Data API sem perda ou duplicacao", async () => {
    const questions = await mainQuestions(42);
    expect(questions).toHaveLength(2024);
    expect(new Set(questions.map((question) => question.id)).size).toBe(2024);
    expect(questions.at(0)?.id).toBe("question-0001");
    expect(questions.at(-1)?.id).toBe("question-2024");
    expect(state.ranges).toEqual([[0, 499], [500, 999], [1000, 1499], [1500, 1999], [2000, 2499]]);
  });

  it("divide snapshots grandes por id e restaura a ordem solicitada", async () => {
    const requested = [...state.questions].reverse().map((question) => String(question.id));
    const questions = await mainQuestionsByIds(42, requested);
    expect(state.idBatches.map((batch) => batch.length)).toEqual([500, 500, 500, 500, 24]);
    expect(questions).toHaveLength(2024);
    expect(questions.map((question) => question.id)).toEqual(requested);
    expect(new Set(questions.map((question) => question.id)).size).toBe(2024);
  });

  it("falha em vez de retornar uma exportacao parcial quando uma pagina intermediaria falha", async () => {
    state.failingPage = 500;
    await expect(mainQuestions(42)).rejects.toThrow("page failure");
    expect(state.ranges).toEqual([[0, 499], [500, 999]]);
  });

  it("mantem a mesma cobertura paginada para arvore e APKG, sem ampliar um recorte", async () => {
    state.questions = state.questions.map((question, index) => ({ ...question, structure_id: index < 1000 ? 10 : 20, pergunta: "Enunciado", resposta: "Certo" }));
    const questions = await mainQuestions(42);
    const entitledScope = questionsInScope(questions, [10]);
    const exported = await buildLawApkg({ slug: "lei-teste", titulo: "Lei de teste" }, questions, [{ id: 10, parent_id: null, nome: "Titulo I" }, { id: 20, parent_id: null, nome: "Titulo II" }]);
    expect(questions).toHaveLength(2024);
    expect(exported.notes).toBe(questions.length);
    expect(entitledScope).toHaveLength(1000);
    expect(entitledScope.every((question) => question.structure_id === 10)).toBe(true);
  });
});
