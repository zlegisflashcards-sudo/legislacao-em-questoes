import "server-only";

import { exigirAdministrador } from "@/lib/admin-auth";
import { canConcludeLegislativeUpdate, UPDATE_STEPS, type UpdateStep } from "@/lib/article-legislative-update";
import { getSupabaseServerClient } from "@/lib/supabase-server";

const text = (value: unknown, limit = 1000) => typeof value === "string" ? value.trim().slice(0, limit) : "";
const isoDate = (value: unknown) => typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null;

async function context(slug: string, ordem: string) {
  const db = getSupabaseServerClient();
  const law = await db.from("leis").select("id,slug,titulo,ultima_alteracao_referencia,ultima_alteracao_data").eq("slug", slug.toLowerCase()).maybeSingle();
  if (law.error || !law.data) throw new Error("Lei do contexto não encontrada.");
  const questions = await db.from("questions").select("id,assunto").eq("lei_id", law.data.id).eq("slug", law.data.slug).eq("ordem", ordem).eq("ativo", true);
  if (questions.error) throw new Error("Não foi possível carregar as questões do dispositivo.");
  return { law: law.data, questions: questions.data ?? [] };
}

export async function articleUpdateOverview(slug: string, ordem: string) {
  await exigirAdministrador(); const { law, questions } = await context(slug, ordem); const db = getSupabaseServerClient();
  const updates = await db.from("article_legislative_updates").select("id,status,observacao_interna,observacao_publica,referencia_normativa,data_incorporacao,marcado_em,concluido_em").eq("lei_id", law.id).eq("slug", law.slug).eq("ordem", ordem).order("marcado_em", { ascending: false });
  if (updates.error) throw new Error("Não foi possível carregar as atualizações legislativas.");
  const ids = (updates.data ?? []).map((item) => String(item.id)); const steps = ids.length ? await db.from("article_legislative_update_steps").select("update_id,step,completed_at").in("update_id", ids) : { data: [], error: null };
  if (steps.error) throw new Error("Não foi possível carregar as tarefas de revisão.");
  return { law: { slug: String(law.slug), title: String(law.titulo), lastReference: law.ultima_alteracao_referencia, lastDate: law.ultima_alteracao_data }, ordem, questions: questions.map((item) => ({ id: String(item.id), assunto: item.assunto ? String(item.assunto) : null })), updates: (updates.data ?? []).map((update) => ({ ...update, steps: UPDATE_STEPS.map((step) => ({ step, completedAt: (steps.data ?? []).find((item) => String(item.update_id) === String(update.id) && item.step === step)?.completed_at ?? null })) })) };
}

export async function createArticleLegislativeUpdate(input: { slug: string; ordem: string; observation: unknown }) {
  const user = await exigirAdministrador(); const { law } = await context(input.slug, input.ordem); const db = getSupabaseServerClient();
  const created = await db.from("article_legislative_updates").insert({ lei_id: law.id, slug: law.slug, ordem: input.ordem, observacao_interna: text(input.observation), marcado_por: user.id }).select("id").single();
  if (created.error) throw new Error("Não foi possível marcar o artigo para atualização.");
  const tasks = await db.from("article_legislative_update_steps").insert(UPDATE_STEPS.map((step) => ({ update_id: created.data.id, step })));
  if (tasks.error) throw new Error("A atualização foi criada, mas não foi possível preparar o checklist.");
  return { id: created.data.id };
}

export async function setArticleLegislativeUpdateStep(input: { updateId: string; step: unknown; completed: unknown }) {
  const user = await exigirAdministrador(); const step = typeof input.step === "string" && (UPDATE_STEPS as readonly string[]).includes(input.step) ? input.step as UpdateStep : null;
  if (!step) throw new Error("Tarefa de revisão inválida."); const completed = input.completed === true; const db = getSupabaseServerClient();
  const result = await db.from("article_legislative_update_steps").update({ completed_at: completed ? new Date().toISOString() : null, completed_by: completed ? user.id : null }).eq("update_id", input.updateId).eq("step", step);
  if (result.error) throw new Error("Não foi possível atualizar a tarefa."); if (completed) await db.from("article_legislative_updates").update({ status: "em_revisao" }).eq("id", input.updateId).eq("status", "pendente"); return { saved: true };
}

export async function concludeArticleLegislativeUpdate(input: { updateId: string; publicNote: unknown; reference: unknown; incorporationDate: unknown }) {
  const user = await exigirAdministrador(); const db = getSupabaseServerClient(); const [update, steps] = await Promise.all([db.from("article_legislative_updates").select("id,lei_id,slug,ordem,status").eq("id", input.updateId).single(), db.from("article_legislative_update_steps").select("step,completed_at").eq("update_id", input.updateId)]);
  if (update.error || !update.data || steps.error) throw new Error("Atualização legislativa não encontrada."); const complete = (steps.data ?? []).filter((item) => item.completed_at).map((item) => String(item.step));
  if (!canConcludeLegislativeUpdate(String(update.data.status), complete)) throw new Error("Conclua todas as tarefas antes de disponibilizar a atualização."); const reference = text(input.reference, 500); const incorporationDate = isoDate(input.incorporationDate);
  if (!reference || !incorporationDate) throw new Error("Informe a referência e a data da alteração incorporada."); const completedAt = new Date().toISOString(); const note = text(input.publicNote);
  const done = await db.from("article_legislative_updates").update({ status: "concluida", concluido_em: completedAt, concluido_por: user.id, observacao_publica: note || null, referencia_normativa: reference, data_incorporacao: incorporationDate }).eq("id", input.updateId);
  if (done.error) throw new Error("Não foi possível concluir a atualização."); const [mapping, law, history] = await Promise.all([
    db.from("article_context_mappings").upsert({ slug: String(update.data.slug), ordem: String(update.data.ordem), atualizacao_legislativa_realizada_em: completedAt, updated_at: completedAt }, { onConflict: "slug,ordem" }),
    db.from("leis").update({ houve_alteracao_legislativa: true, ultima_alteracao_referencia: reference, ultima_alteracao_data: incorporationDate, situacao_atualizacao: "atualizado" }).eq("id", update.data.lei_id),
    db.from("historico_atualizacoes_leis").insert({ lei_id: update.data.lei_id, tipo: "alteracao_legislativa", importancia: "informativa", titulo: `Atualização legislativa incorporada — ${update.data.ordem}`, descricao_resumida: note || null, referencia_normativa: reference, data_referencia_normativa: incorporationDate, visivel_aluno: true, visivel_catalogo: false, criado_por: user.id, data_publicacao: completedAt }),
  ]);
  if (mapping.error || law.error || history.error) throw new Error("A revisão foi concluída, mas não foi possível atualizar todos os registros de controle."); return { completedAt };
}
