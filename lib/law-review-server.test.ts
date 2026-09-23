import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { pendingQuestionIds, reviewQuestionIds } from "@/lib/law-review-rules";

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

  it("inclui somente questões não respondidas dos níveis anteriores à posição atual", () => {
    const pending = pendingQuestionIds([
      { ordem: 30, questoesIds: ["q4"], concluido: false },
      { ordem: 10, questoesIds: ["q1", "q2"], concluido: true },
      { ordem: 20, questoesIds: ["q3"], concluido: true },
      { ordem: 40, questoesIds: ["q5"], concluido: false },
    ], false);
    const result = reviewQuestionIds(["q1", "q2", "q3", "q4", "q5"], ["q1"], [], [], pending);
    expect([...result.unanswered]).toEqual(["q2", "q3"]);
  });

  it("não inclui níveis atual ou futuros e atualiza o contador depois da resposta", () => {
    const pending = pendingQuestionIds([
      { ordem: 0, questoesIds: ["q1", "q2"], concluido: true },
      { ordem: 1, questoesIds: ["q3"], concluido: false },
      { ordem: 2, questoesIds: ["q4"], concluido: false },
    ], false);
    expect([...reviewQuestionIds(questions, [], [], [], pending).unanswered]).toEqual(["q1", "q2"]);
    expect([...reviewQuestionIds(questions, ["q2"], [], [], pending).unanswered]).toEqual(["q1"]);
  });

  it("fica vazio no primeiro nível após reset e considera níveis percorridos apenas em campanha concluída", () => {
    const firstLevel = [{ ordem: 0, questoesIds: ["q1"], concluido: false }, { ordem: 1, questoesIds: ["q2"], concluido: false }];
    expect(pendingQuestionIds(firstLevel, false).size).toBe(0);
    const completed = pendingQuestionIds([{ ordem: 0, questoesIds: ["q1", "q2"], concluido: true }], true);
    expect([...reviewQuestionIds(questions, ["q1"], [], [], completed).unanswered]).toEqual(["q2"]);
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
