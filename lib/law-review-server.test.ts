import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { reviewQuestionIds } from "@/lib/law-review-rules";

describe("revisões do Estudo Livre", () => {
  const questions = ["q1", "q2", "q3", "q4"];

  it("mantém no caderno cada erro distinto da campanha ativa, mesmo após acerto", () => {
    const result = reviewQuestionIds(questions, ["q1", "q2"], ["q1", "q1"], []);
    expect([...result.errors]).toEqual(["q1"]);
  });

  it("zera o Caderno de erros quando não há campanha ativa após reset", () => {
    const beforeReset = reviewQuestionIds(questions, ["q1"], ["q1"], []);
    const afterReset = reviewQuestionIds(questions, ["q1"], [], []);
    expect(beforeReset.errors.size).toBe(1);
    expect(afterReset.errors.size).toBe(0);
  });

  it("preserva favoritos e a unicidade por questão entre resets", () => {
    const beforeReset = reviewQuestionIds(questions, ["q1"], ["q1"], ["q2", "q2"]);
    const afterReset = reviewQuestionIds(questions, ["q1"], [], ["q2", "q2"]);
    expect([...beforeReset.favorites]).toEqual(["q2"]);
    expect([...afterReset.favorites]).toEqual(["q2"]);
  });

  it("não reapresenta como não feita questão respondida em campanha arquivada", () => {
    const result = reviewQuestionIds(questions, ["q1", "q2"], [], []);
    expect([...result.unanswered]).toEqual(["q3", "q4"]);
  });
});

describe("migration de favoritos", () => {
  const migration = readFileSync("supabase/migrations/20260923100000_create_student_question_favorites.sql", "utf8");
  it("preserva a relação por aluno e questão e revalida o schema do PostgREST", () => {
    expect(migration).toContain("primary key (aluno_id, questao_id)");
    expect(migration).toContain("references public.alunos(id) on delete cascade");
    expect(migration).toContain("references public.questions(id) on delete cascade");
    expect(migration).toContain("enable row level security");
    expect(migration).toContain("revoke all on public.alunos_questoes_favoritas from public, anon, authenticated");
    expect(migration).toContain("notify pgrst, 'reload schema'");
  });
});
