import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { nextExamLawProgress } from "./student-exams";

const migration = readFileSync("supabase/migrations/20260811150000_create_student_exam_notices.sql", "utf8");

function simulateReorder(current: number[], requested: number[]) {
  if (current.length !== requested.length || new Set(requested).size !== requested.length || requested.some((law) => !current.includes(law))) throw new Error("invalid");
  const base = Math.max(-1, current.length - 1) + current.length + 1;
  const temporary = current.map((law, ordem) => ({ law, ordem: base + ordem }));
  return requested.map((law, ordem) => ({ law, ordem, temporary: temporary.find((item) => item.law === law)?.ordem }));
}

describe("migration Meu Edital", () => {
  it("preserva as invariantes de um edital e uma lei por posicao", () => {
    expect(migration).toContain("editais_personalizados_alunos_aluno_key unique (aluno_id)");
    expect(migration).toContain("primary key (edital_id, lei_id)");
    expect(migration).toContain("editais_personalizados_leis_ordem_check check (ordem >= 0)");
    expect(migration).toContain("editais_personalizados_leis_ordem_key unique (edital_id, ordem)");
  });

  it("reordena por faixa temporaria positiva e final sequencial", () => {
    expect(migration).toContain("coalesce(max(ordem),-1)+v_total+1 into v_base");
    expect(migration).toContain("set ordem=v_base+ordem where edital_id=v_id");
    expect(migration).toContain("ord::integer-1 as ordem");
    expect(migration).not.toContain("ordem = -ordem-1");
    expect(migration).not.toContain("set ordem = -ordem");
  });

  it("limita a reordenacao ao edital do aluno e mantem progresso fora das tabelas de edital", () => {
    const reorder = migration.slice(migration.indexOf("create or replace function public.reordenar_meu_edital"), migration.indexOf("revoke all on function"));
    expect(reorder).toContain("where edital_id=v_id");
    expect(reorder).toContain("cardinality(p_leis)<>v_total");
    expect(reorder).not.toContain("progresso_leis_alunos");
  });

  it("cobre primeira/ultima, intermediarias, edital unitario e reordenacoes consecutivas sem colisao", () => {
    expect(simulateReorder([1, 2, 3], [2, 3, 1]).map((item) => item.ordem)).toEqual([0, 1, 2]);
    expect(simulateReorder([1, 2, 3], [3, 1, 2]).map((item) => item.ordem)).toEqual([0, 1, 2]);
    expect(simulateReorder([1, 2, 3, 4], [1, 3, 2, 4]).map((item) => item.law)).toEqual([1, 3, 2, 4]);
    expect(simulateReorder([1], [1])).toEqual([{ law: 1, ordem: 0, temporary: 2 }]);
    const first = simulateReorder([1, 2, 3], [3, 2, 1]).map((item) => item.law);
    const second = simulateReorder(first, [2, 1, 3]);
    expect(second.map((item) => item.law)).toEqual([2, 1, 3]);
    expect(second.map((item) => item.ordem)).toEqual([0, 1, 2]);
    expect(second.every((item) => item.ordem >= 0 && item.temporary! >= 0)).toBe(true);
    expect(new Set(second.map((item) => item.ordem)).size).toBe(second.length);
    expect(() => simulateReorder([1, 2], [1, 1])).toThrow("invalid");
  });
});

describe("progresso compartilhado no Meu Edital", () => {
  it("segue a transição restante, estudo e revisão sem estado inconsistente", () => {
    expect(nextExamLawProgress({ emEstudo: false, revisao: false }, "study")).toEqual({ inStudy: true, questionsFinished: false });
    expect(nextExamLawProgress({ emEstudo: true, revisao: false }, "review")).toEqual({ inStudy: true, questionsFinished: true });
    expect(nextExamLawProgress({ emEstudo: true, revisao: true }, "review")).toEqual({ inStudy: true, questionsFinished: false });
    expect(nextExamLawProgress({ emEstudo: true, revisao: true }, "study")).toBeNull();
  });

  it("deriva o progresso exclusivamente do status de campanha", () => {
    const client = readFileSync("components/student-exam-client.tsx", "utf8");
    expect(client).toContain('law.campaignStatus === "concluida"'); expect(client).toContain('completed}/{total} concluídas'); expect(client).not.toContain('ProgressControl');
  });

  it("mantém o edital do produto sincronizado pela composição viva de produto_leis", () => {
    const migration = readFileSync("supabase/migrations/20260811150000_create_student_exam_notices.sql", "utf8");
    expect(migration).toContain("join public.produto_leis pl on pl.produto_id=p.id");
    expect(migration).toContain("order by pl.ordem,l.id");
    expect(migration).toContain("p.tipo_produto='edital'");
    expect(migration).toContain("exists(select 1 from public.liberacoes_leis r join aluno a on a.id=r.aluno_id where r.produto_id=p.id and r.status='ativo')");
    expect(migration).not.toContain("cache");
    expect(migration).not.toContain("materialized");
  });

  it("não oferece controles manuais de estudo ou revisão", () => {
    const client = readFileSync("components/student-exam-client.tsx", "utf8");
    for (const old of ['Estudando', 'Revisão', 'Anki', 'streak', 'ProgressControl']) expect(client).not.toContain(old);
  });

  it("seleciona o primeiro edital e mostra estado vazio", () => {
    const client = readFileSync("components/student-exam-client.tsx", "utf8");
    expect(client).toContain('body.editais[0]?.id ?? ""'); expect(client).toContain('Monte seu edital'); expect(client).toContain('Ir para Legis Questões');
  });

  it("usa a primeira lei não concluída como próximo estudo", () => {
    const client = readFileSync("components/student-exam-client.tsx", "utf8");
    expect(client).toContain('current?.leis.find((law) => law.campaignStatus !== "concluida")'); expect(client).toContain('Próximo estudo:'); expect(client).toContain('/estudar/lei/${encodeURIComponent(next.slug)}');
  });
});
