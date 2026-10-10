import "server-only";

import { exigirAdministrador } from "@/lib/admin-auth";
import { canConcludeLegislativeUpdate, legislationSignature, normalizeSupportingOrders, UPDATE_STEPS, type UpdateStep } from "@/lib/article-legislative-update";
import { getSupabaseServerClient } from "@/lib/supabase-server";

type Question = { id: string; slug: string; ordem: string; assunto: string | null; legislacao: string | null; pergunta: string };
const text = (value: unknown, limit = 4000) => typeof value === "string" ? value.trim().slice(0, limit) : "";

async function context(slug: string, ordem: string) {
  const db = getSupabaseServerClient();
  const law = await db.from("leis").select("id,slug,titulo").eq("slug", slug.toLowerCase()).maybeSingle();
  if (law.error || !law.data) throw new Error("Lei do contexto não encontrada.");
  const questions = await db.from("questions").select("id,slug,ordem,assunto,legislacao,pergunta").eq("lei_id", law.data.id).eq("slug", law.data.slug).eq("ordem", ordem).eq("ativo", true);
  if (questions.error) throw new Error("Não foi possível carregar as questões do dispositivo.");
  return { law: { id: Number(law.data.id), slug: String(law.data.slug), title: String(law.data.titulo) }, questions: (questions.data ?? []) as Question[] };
}

export async function articleUpdateOverview(rawSlug: string, rawOrdem: string) {
  await exigirAdministrador();
  const { law, questions } = await context(rawSlug, rawOrdem);
  const db = getSupabaseServerClient();
  const questionIds = questions.map((item) => item.id);
  const [supports, combinations, updates, supportingLinks] = await Promise.all([
    questionIds.length ? db.from("question_supporting_devices").select("question_id,slug,ordem,created_at").in("question_id", questionIds) : Promise.resolve({ data: [], error: null }),
    questionIds.length ? db.from("question_intentional_combinations").select("question_id,legislation_signature,justification,decided_at,invalidated_at").in("question_id", questionIds).order("decided_at", { ascending: false }) : Promise.resolve({ data: [], error: null }),
    db.from("article_legislative_updates").select("id,status,observacao_interna,observacao_publica,marcado_em,concluido_em").eq("lei_id", law.id).eq("slug", law.slug).eq("ordem", rawOrdem).order("marcado_em", { ascending: false }),
    db.from("question_supporting_devices").select("question_id").eq("lei_id", law.id).eq("slug", law.slug).eq("ordem", rawOrdem),
  ]);
  if (supports.error || combinations.error || updates.error || supportingLinks.error) throw new Error("Não foi possível carregar os vínculos editoriais do artigo.");
  const supportingQuestionIds = [...new Set((supportingLinks.data ?? []).map((item) => String(item.question_id)).filter((id) => !questionIds.includes(id)))];
  const impactedSupportQuestions = supportingQuestionIds.length ? await db.from("questions").select("id,slug,ordem,assunto").in("id", supportingQuestionIds).eq("ativo", true) : { data: [], error: null };
  if (impactedSupportQuestions.error) throw new Error("Não foi possível carregar as questões que usam este dispositivo como apoio.");
  const updateIds = (updates.data ?? []).map((item) => String(item.id));
  const steps = updateIds.length ? await db.from("article_legislative_update_steps").select("update_id,step,completed_at").in("update_id", updateIds) : { data: [], error: null };
  if (steps.error) throw new Error("Não foi possível carregar as etapas da atualização.");
  const supportsByQuestion = new Map<string, Array<{ slug: string; ordem: string }>>();
  for (const row of supports.data ?? []) supportsByQuestion.set(String(row.question_id), [...(supportsByQuestion.get(String(row.question_id)) ?? []), { slug: String(row.slug), ordem: String(row.ordem) }]);
  const combinationByQuestion = new Map<string, { justification: string; decidedAt: string; valid: boolean }>();
  for (const row of combinations.data ?? []) if (!combinationByQuestion.has(String(row.question_id))) {
    const question = questions.find((item) => item.id === String(row.question_id));
    combinationByQuestion.set(String(row.question_id), { justification: String(row.justification), decidedAt: String(row.decided_at), valid: !row.invalidated_at && Boolean(question && legislationSignature(question.legislacao) === String(row.legislation_signature)) });
  }
  return {
    law, ordem: rawOrdem,
    questions: questions.map((question) => ({ id: question.id, assunto: question.assunto, legislacao: question.legislacao, supports: supportsByQuestion.get(question.id) ?? [], combination: combinationByQuestion.get(question.id) ?? null })),
    impactedSupportQuestions: (impactedSupportQuestions.data ?? []).map((question) => ({ id: String(question.id), slug: String(question.slug), ordem: String(question.ordem), assunto: question.assunto ? String(question.assunto) : null })),
    updates: (updates.data ?? []).map((update) => ({ ...update, steps: UPDATE_STEPS.map((step) => ({ step, completedAt: (steps.data ?? []).find((item) => String(item.update_id) === String(update.id) && item.step === step)?.completed_at ?? null })) })),
  };
}

export async function saveIntentionalCombination(input: { slug: string; ordem: string; questionId: string; supports: unknown; justification: unknown }) {
  const user = await exigirAdministrador();
  const { law, questions } = await context(input.slug, input.ordem);
  const question = questions.find((item) => item.id === input.questionId);
  if (!question) throw new Error("Questão não pertence ao dispositivo principal.");
  const supports = normalizeSupportingOrders(input.supports).filter((item) => !(item.slug === law.slug && item.ordem === input.ordem));
  const justification = text(input.justification);
  if (!supports.length || !justification) throw new Error("Informe ao menos um dispositivo de apoio e a justificativa editorial.");
  const db = getSupabaseServerClient();
  const replaced = await db.from("question_intentional_combinations").update({ invalidated_at: new Date().toISOString(), invalidated_reason: "Substituída por nova decisão editorial." }).eq("question_id", question.id).is("invalidated_at", null);
  if (replaced.error) throw new Error("Não foi possível preservar o histórico da combinação anterior.");
  const remove = await db.from("question_supporting_devices").delete().eq("question_id", question.id);
  if (remove.error) throw new Error("Não foi possível atualizar os dispositivos de apoio.");
  const insertedSupports = await db.from("question_supporting_devices").insert(supports.map((item) => ({ question_id: question.id, lei_id: law.id, slug: item.slug, ordem: item.ordem, created_by: user.id })));
  if (insertedSupports.error) throw new Error("Não foi possível registrar os dispositivos de apoio.");
  const combination = await db.from("question_intentional_combinations").insert({ question_id: question.id, legislation_signature: legislationSignature(question.legislacao), justification, supporting_snapshot: supports, decided_by: user.id });
  if (combination.error) throw new Error("Não foi possível registrar a justificativa editorial.");
  return { saved: true };
}

export async function createArticleLegislativeUpdate(input: { slug: string; ordem: string; observation: unknown }) {
  const user = await exigirAdministrador();
  const { law } = await context(input.slug, input.ordem);
  const db = getSupabaseServerClient();
  const created = await db.from("article_legislative_updates").insert({ lei_id: law.id, slug: law.slug, ordem: input.ordem, observacao_interna: text(input.observation), marcado_por: user.id }).select("id").single();
  if (created.error) throw new Error("Não foi possível marcar o artigo para atualização.");
  const steps = await db.from("article_legislative_update_steps").insert(UPDATE_STEPS.map((step) => ({ update_id: created.data.id, step })));
  if (steps.error) throw new Error("A atualização foi criada, mas não foi possível preparar as etapas.");
  return { id: created.data.id };
}

export async function setArticleLegislativeUpdateStep(input: { updateId: string; step: unknown; completed: unknown }) {
  const user = await exigirAdministrador();
  const step = typeof input.step === "string" && (UPDATE_STEPS as readonly string[]).includes(input.step) ? input.step as UpdateStep : null;
  if (!step) throw new Error("Etapa de revisão inválida.");
  const value = input.completed === true;
  const result = await getSupabaseServerClient().from("article_legislative_update_steps").update({ completed_at: value ? new Date().toISOString() : null, completed_by: value ? user.id : null }).eq("update_id", input.updateId).eq("step", step);
  if (result.error) throw new Error("Não foi possível atualizar a etapa.");
  if (value) await getSupabaseServerClient().from("article_legislative_updates").update({ status: "em_revisao" }).eq("id", input.updateId).eq("status", "pendente");
  return { saved: true };
}

export async function concludeArticleLegislativeUpdate(input: { updateId: string; publicNote: unknown }) {
  const user = await exigirAdministrador(); const db = getSupabaseServerClient();
  const [update, steps] = await Promise.all([db.from("article_legislative_updates").select("id,lei_id,slug,ordem,status").eq("id", input.updateId).single(), db.from("article_legislative_update_steps").select("step,completed_at").eq("update_id", input.updateId)]);
  if (update.error || !update.data || steps.error) throw new Error("Atualização legislativa não encontrada.");
  const complete = (steps.data ?? []).filter((item) => item.completed_at).map((item) => String(item.step));
  if (!canConcludeLegislativeUpdate(String(update.data.status), complete)) throw new Error("Conclua as quatro etapas de revisão antes de disponibilizar a atualização.");
  const completedAt = new Date().toISOString(); const note = text(input.publicNote, 1000);
  const done = await db.from("article_legislative_updates").update({ status: "concluida", concluido_em: completedAt, concluido_por: user.id, observacao_publica: note || null }).eq("id", input.updateId);
  if (done.error) throw new Error("Não foi possível concluir a atualização.");
  const history = await db.from("historico_atualizacoes_leis").insert({ lei_id: update.data.lei_id, tipo: "alteracao_legislativa", importancia: "informativa", titulo: `Atualização legislativa incorporada — ${update.data.ordem}`, descricao_resumida: note || null, visivel_aluno: true, visivel_catalogo: false, criado_por: user.id, data_publicacao: completedAt });
  if (history.error) throw new Error("A atualização foi concluída, mas não foi possível registrar o histórico público.");
  return { completedAt };
}
