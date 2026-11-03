import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { nextExamLawProgress, selectExamReferenceCampaign, summarizeExamLawProgress } from "./student-exams";

const migration = readFileSync("supabase/migrations/20260811150000_create_student_exam_notices.sql", "utf8");
const scopedContextMigration = readFileSync("supabase/migrations/20260831130000_add_scoped_student_exam_context.sql", "utf8");

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

  it("exibe somente uma barra azul de progresso, sem percentual ou status visível por lei", () => {
    const client = readFileSync("components/student-exam-client.tsx", "utf8");
    expect(client).toContain('function ExamProgressBar');
    expect(client).not.toContain('Significado da barra:');
    expect(client).toContain('bg-blue-400'); expect(client).toContain('h-3'); expect(client).toContain('role="progressbar"');
    expect(client).not.toContain('% concluído'); expect(client).not.toContain('Não iniciada');
    for (const forbidden of ['{percent}%', 'Progresso geral', 'Melhor score', 'Posição no ranking', 'ProgressControl']) expect(client).not.toContain(forbidden);
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

  it("mostra apenas o edital personalizado e oferece a criacao unica", () => {
    const client = readFileSync("components/student-exam-client.tsx", "utf8");
    expect(client).toContain('function preferredExamId(editais: StudentExam[])');
    expect(client).toContain('const personalizedEditais: StudentExam[] = body.editais.filter((exam: StudentExam) => exam.tipo === "personalizado")');
    expect(client).not.toContain('aria-label="Selecionar edital"');
    expect(client).toContain('const editaisResponse = await request("/api/aluno/editais")');
    expect(client).toContain('const loadAvailableLaws = useCallback(async () =>');
    expect(client).toContain('onFocusCapture={() => void loadAvailableLaws()}');
    expect(client).not.toContain('onClick={() => setSelected(exam.id)}');
    expect(client).toContain('Seu edital personalizado não está disponível agora.');
    expect(client).toContain('await load(action === "rename")');
  });

  it("mantém a edição da composição somente no personalizado", () => {
    const client = readFileSync("components/student-exam-client.tsx", "utf8");
    expect(client).toContain('availableLaws.filter((law) => !current?.leis.some');
    expect(client).toContain('await change("add", { leiId: lawId })');
    expect(client).toContain('change("remove", { leiId: law.id })');
    expect(client).toContain('aria-label={`Mover ${label} para cima`}');
    expect(client).toContain('current && customExists ? <section');
  });

  it("não cria recomendação de próximo estudo na interface minimalista", () => {
    const client = readFileSync("components/student-exam-client.tsx", "utf8");
    expect(client).not.toContain('Próximo estudo:'); expect(client).not.toContain('const next ='); expect(client).toContain('/estudar/lei/${encodeURIComponent(law.slug)}');
  });

  it("mantém a lista vertical e os controles de ordem sem adicionar indicadores competitivos", () => {
    const client = readFileSync("components/student-exam-client.tsx", "utf8");
    expect(client).toContain('md:grid-cols-[minmax(0,1fr)_minmax(220px,300px)_auto]');
    expect(client).toContain('aria-label={`Mover ${label} para cima`}');
    expect(client).toContain('aria-label={`Mover ${label} para baixo`}');
    expect(client).toContain('Leis do edital');
    expect(client).toContain('const completedLaws = current?.leis.filter((law) => law.progress.unanswered === 0');
    expect(client).toContain('{completedLaws}/{current.leis.length}');
    expect(client).not.toContain('⚙ Organizar edital');
    expect(client).toContain('＋ Adicionar lei');
    expect(client).toContain('Clique na seta');
    expect(client).toContain('para acessar todos os recursos da lei e no nome da lei para colocá-la em foco.');
    expect(client).toContain('aria-label={`Abrir ${label} completo em página própria`}');
    expect(client).toContain('overflow-x-hidden');
    expect(client).toContain('<ExamProgressBar progress={law.progress} />');
    expect(client).not.toContain('Lei ainda não concluída');
  });

  it("leva uma campanha concluída à página de desempenho sem iniciar outra tentativa", () => {
    const client = readFileSync("components/student-exam-client.tsx", "utf8");
    expect(client).toContain('const completed = law.campaignStatus === "concluida"');
    expect(client).toContain('const campaignHref = `/questoes/${encodeURIComponent(law.slug)}/estudar${law.recorteId ? `?recorte_id=${encodeURIComponent(law.recorteId)}` : ""}`');
    expect(client).toContain('const actionLabel = completed ? "Ver desempenho final"');
    expect(client).toContain('href={campaignHref}');
  });
});

describe("contextos autorizados no Meu Edital", () => {
  it("mantém uma única linha por lei e troca apenas o contexto confirmado", () => {
    expect(migration).toContain("primary key (edital_id, lei_id)");
    expect(scopedContextMigration).toContain("create or replace function public.definir_contexto_lei_meu_edital");
    expect(scopedContextMigration).toContain("p_confirmar_substituicao boolean default false");
    expect(scopedContextMigration).toContain("set recorte_id = p_recorte_id");
    expect(scopedContextMigration).toContain("recorte_lei_id = case when p_recorte_id is null then null else p_lei_id end");
  });

  it("valida no banco a liberação exata, o recorte ativo e a mesma lei", () => {
    expect(scopedContextMigration).toContain("liberacao.aluno_id = v_aluno_id");
    expect(scopedContextMigration).toContain("produto_lei.recorte_id = p_recorte_id");
    expect(scopedContextMigration).toContain("recorte.lei_id = p_lei_id");
    expect(scopedContextMigration).toContain("and recorte.ativo");
    expect(scopedContextMigration).toContain("Contexto de estudo nao liberado.");
  });

  it("preserva o contexto de recorte nas áreas de estudo e no edital", () => {
    const laws = readFileSync("components/student-laws-client.tsx", "utf8");
    const server = readFileSync("lib/student-exams-server.ts", "utf8");
    const exam = readFileSync("components/student-exam-client.tsx", "utf8");
    expect(laws).toContain('recorte_id=${encodeURIComponent(scopeId)}');
    expect(laws).toContain('}/anki${scopeId ?');
    expect(server).toContain('fn: "definir_contexto_lei_meu_edital"');
    expect(exam).toContain("law.recorteId ? `/questoes/${encodeURIComponent(law.slug)}/estudar?livre=1&recorte_id=${encodeURIComponent(law.recorteId)}`");
  });
});

describe("barra diagnóstica do Meu Edital", () => {
  const universe = ["a", "b", "c", "new"];

  it("fica integralmente cinza quando não há campanha de referência", () => {
    expect(summarizeExamLawProgress(universe, [])).toEqual({ correct: 0, errors: 0, unanswered: 4 });
  });

  it("separa acertos, erros e não respondidas sem ultrapassar o universo", () => {
    expect(summarizeExamLawProgress(universe, [{ questionId: "a", correct: true }, { questionId: "b", correct: false }])).toEqual({ correct: 1, errors: 1, unanswered: 2 });
    expect(summarizeExamLawProgress(["a", "b"], [{ questionId: "a", correct: true }, { questionId: "b", correct: true }])).toEqual({ correct: 2, errors: 0, unanswered: 0 });
    expect(summarizeExamLawProgress(["a", "b"], [{ questionId: "a", correct: false }, { questionId: "b", correct: false }])).toEqual({ correct: 0, errors: 2, unanswered: 0 });
  });

  it("respeita o universo do recorte, questões novas e a resposta final de cada questão", () => {
    expect(summarizeExamLawProgress(["a", "c"], [{ questionId: "b", correct: true }, { questionId: "a", correct: false }, { questionId: "a", correct: true }])).toEqual({ correct: 0, errors: 1, unanswered: 1 });
    const progress = summarizeExamLawProgress(universe, [{ questionId: "a", correct: true }, { questionId: "b", correct: false }]);
    expect(progress.correct + progress.errors + progress.unanswered).toBe(universe.length);
  });

  it("usa apenas campanhas válidas, em lote, e ignora a referência anterior após reset", () => {
    const server = readFileSync("lib/student-exams-server.ts", "utf8");
    expect(server).toContain('eq("abandonada", false)');
    expect(server).toContain('state?.status_campanha === "concluida"');
    expect(server).toContain('campanha_ativa_id');
    expect(server).toContain('order("respondido_em", { ascending: false }).order("id", { ascending: false })');
    expect(server).toContain('listLawStudyContextsByLaw(studentId, lawIds)');
    expect(selectExamReferenceCampaign({ status: "em_andamento", campaignId: "active" }, [{ id: "active", concluded: false }, { id: "old", concluded: true }])).toBe("active");
    expect(selectExamReferenceCampaign({ status: "concluida", campaignId: null }, [{ id: "latest", concluded: true }, { id: "old", concluded: true }])).toBe("latest");
    expect(selectExamReferenceCampaign({ status: "nao_iniciada", campaignId: null }, [{ id: "old", concluded: true }])).toBeNull();
  });
});
