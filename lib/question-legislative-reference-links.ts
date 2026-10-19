import "server-only";

import { obterAdministrador } from "@/lib/admin-auth";
import { getSupabaseServerClient } from "@/lib/supabase-server";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const QUERY_BATCH_SIZE = 150;

type ReferenceRow = { id: string; slug: string; ordem: string; identificacao: string; preparado_em: string | null };

function chunks<T>(items: T[], size = QUERY_BATCH_SIZE) {
  const result: T[][] = [];
  for (let index = 0; index < items.length; index += size) result.push(items.slice(index, index + size));
  return result;
}

/** Vínculos editoriais explícitos da questão ao bloco legislativo preparado. */
export async function listManualQuestionReferenceTargets(questionIds: string[]) {
  const ids = [...new Set(questionIds.filter((id) => UUID.test(id)))];
  if (!ids.length) return [] as { questionId: string; referenceId: string }[];
  const rows: { question_id: string; reference_id: string }[] = [];
  for (const batch of chunks(ids)) {
    const result = await getSupabaseServerClient().from("question_legislative_reference_links").select("question_id,reference_id").in("question_id", batch);
    if (result.error) throw new Error("Não foi possível consultar os vínculos editoriais dos blocos legislativos.");
    rows.push(...((result.data ?? []) as { question_id: string; reference_id: string }[]));
  }
  return rows.map((row) => ({ questionId: row.question_id, referenceId: row.reference_id }));
}

export async function searchLegislativeReferencesForQuestionLink(input: { slug: string; query?: string; page?: number; pageSize?: number }) {
  const user = await obterAdministrador();
  if (!user) throw new Error("Autenticação administrativa obrigatória.");
  const slug = input.slug.trim().toLowerCase();
  if (!/^[a-z0-9_-]{1,50}$/.test(slug)) throw new Error("Legislação inválida.");
  const query = (input.query ?? "").trim().slice(0, 120).replace(/[,%()]/g, " ");
  const pageSize = Math.min(50, Math.max(1, Number(input.pageSize) || 20));
  const page = Math.max(1, Number(input.page) || 1);
  let request = getSupabaseServerClient().from("legislative_references").select("id,slug,ordem,identificacao,preparado_em", { count: "exact" }).eq("slug", slug).not("preparado_em", "is", null).order("ordem").order("id").range((page - 1) * pageSize, page * pageSize - 1);
  if (query) {
    const value = `%${query}%`;
    request = UUID.test(query) ? request.eq("id", query) : request.or(`ordem.ilike.${value},identificacao.ilike.${value}`);
  }
  const result = await request;
  if (result.error) throw new Error("Não foi possível pesquisar os blocos legislativos desta lei.");
  return { records: (result.data ?? []) as ReferenceRow[], page, pageSize, total: result.count ?? 0, hasNextPage: (result.count ?? 0) > page * pageSize };
}

export async function setQuestionLegislativeReferenceLink(input: { questionIds: string[]; referenceId: string | null }) {
  const user = await obterAdministrador();
  if (!user) throw new Error("Autenticação administrativa obrigatória.");
  const ids = [...new Set(input.questionIds.filter((id) => UUID.test(id)))];
  if (!ids.length || ids.length > 100) throw new Error("Selecione de 1 a 100 questões.");
  const db = getSupabaseServerClient();
  if (input.referenceId === null) {
    const deleted = await db.from("question_legislative_reference_links").delete().in("question_id", ids);
    if (deleted.error) throw new Error("Não foi possível remover os vínculos dos blocos legislativos.");
    return { linked: 0, unlinked: ids.length };
  }
  if (!UUID.test(input.referenceId)) throw new Error("Bloco legislativo inválido.");
  const reference = await db.from("legislative_references").select("id,preparado_em").eq("id", input.referenceId).maybeSingle();
  if (reference.error || !reference.data || !reference.data.preparado_em) throw new Error("O bloco legislativo selecionado não está preparado.");
  const saved = await db.from("question_legislative_reference_links").upsert(ids.map((questionId) => ({ question_id: questionId, reference_id: input.referenceId, linked_by: user.id })), { onConflict: "question_id" });
  if (saved.error) throw new Error(saved.error.code === "23514" ? "O bloco legislativo selecionado pertence a outra legislação." : "Não foi possível salvar os vínculos dos blocos legislativos.");
  return { linked: ids.length, unlinked: 0 };
}
