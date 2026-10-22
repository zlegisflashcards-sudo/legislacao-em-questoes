import "server-only";

import { getSupabaseServerClient } from "@/lib/supabase-server";
import { collectPages } from "@/lib/law-question-pagination";

export type MainQuestion = { id: string; lei_id: number; structure_id: number | null; pergunta: string; resposta: string; justificativa: string | null; assunto: string | null; legislacao: string | null; ordem: string; titulo: string | null; total_artigos: number | null; slug: string; ultima_alteracao_legislativa: string | null; capitulo: string | null; secao: string | null; subsecao: string | null; artigo: string | null; ativo: boolean };
const MAIN_QUERY_PAGE_SIZE = 500;
const mainQuestionColumns = "id,lei_id,structure_id,pergunta,resposta,justificativa,assunto,legislacao,ordem,titulo,total_artigos,slug,ultima_alteracao_legislativa,capitulo,secao,subsecao,artigo,ativo";

export async function mainLawBySlug(slug: string) {
  const result = await getSupabaseServerClient().from("leis").select("id,slug,titulo,nome_curto,codigo,ativo").eq("slug", slug).eq("ativo", true).eq("status_publicacao", "ativa").maybeSingle();
  if (result.error) throw new Error(`Não foi possível localizar a lei: ${result.error.message}`);
  return result.data;
}

export async function mainQuestions(leiId: number, filters: { structureIds?: number[]; values?: Record<string, string> } = {}) {
  // `ordem` é pedagógica e pode se repetir. created_at preserva a ordem de
  // cadastro; id fecha qualquer empate remanescente de forma determinística.
  return collectPages<MainQuestion>(async (from, to) => {
    let query = getSupabaseServerClient().from("questions").select(mainQuestionColumns).eq("lei_id", leiId).eq("ativo", true).order("ordem").order("created_at").order("id");
    if (filters.structureIds?.length) query = query.in("structure_id", filters.structureIds);
    for (const [field, value] of Object.entries(filters.values ?? {})) if (["titulo", "capitulo", "secao", "subsecao"].includes(field)) query = query.eq(field, value);
    const result = await query.range(from, to);
    if (result.error) throw new Error(`Não foi possível carregar as questões: ${result.error.message}`);
    return (result.data ?? []) as MainQuestion[];
  }, MAIN_QUERY_PAGE_SIZE);
}

export async function mainQuestionById(leiId: number, questionId: string) {
  const result = await getSupabaseServerClient().from("questions").select("id,lei_id,structure_id,pergunta,resposta,justificativa,assunto,legislacao,ordem,titulo,total_artigos,slug,ultima_alteracao_legislativa,capitulo,secao,subsecao,artigo,ativo").eq("lei_id", leiId).eq("id", questionId).eq("ativo", true).maybeSingle();
  if (result.error) throw new Error(`Não foi possível carregar a questão: ${result.error.message}`);
  return result.data as MainQuestion | null;
}

/** Carrega somente o snapshot de questões solicitado, preservando a ordem da campanha. */
export async function mainQuestionsByIds(leiId: number, questionIds: string[]) {
  const uniqueIds = [...new Set(questionIds)];
  if (!uniqueIds.length) return [] as MainQuestion[];
  const pages = await Promise.all(Array.from({ length: Math.ceil(uniqueIds.length / MAIN_QUERY_PAGE_SIZE) }, async (_, index) => {
    const ids = uniqueIds.slice(index * MAIN_QUERY_PAGE_SIZE, (index + 1) * MAIN_QUERY_PAGE_SIZE);
    const result = await getSupabaseServerClient().from("questions").select(mainQuestionColumns).eq("lei_id", leiId).eq("ativo", true).in("id", ids).order("id");
    if (result.error) throw new Error(`Não foi possível carregar as questões: ${result.error.message}`);
    return result.data ?? [];
  }));
  const byId = new Map(pages.flat().map((question) => [question.id, question as MainQuestion]));
  return uniqueIds.flatMap((id) => byId.get(id) ? [byId.get(id)!] : []);
}

export async function mainStructure(leiId: number) {
  return collectPages(async (from, to) => {
    const result = await getSupabaseServerClient().from("law_structure").select("id,lei_id,parent_id,tipo,nome,ordem,ativo,created_at,updated_at").eq("lei_id", leiId).eq("ativo", true).order("ordem").order("id").range(from, to);
    if (result.error) throw new Error(`Não foi possível carregar a estrutura: ${result.error.message}`);
    return result.data ?? [];
  }, MAIN_QUERY_PAGE_SIZE);
}

export async function mainActiveQuestionCountsBySlug(slugs: string[]) {
  const unique = [...new Set(slugs.map((slug) => slug.trim()).filter(Boolean))];
  const counts = new Map(unique.map((slug) => [slug, 0]));
  if (!unique.length) return counts;
  const { data: laws, error: lawsError } = await getSupabaseServerClient().from("leis").select("id,slug").in("slug", unique).eq("ativo", true).eq("status_publicacao", "ativa");
  if (lawsError) throw new Error(`Não foi possível localizar as leis: ${lawsError.message}`);
  const results = await Promise.all((laws ?? []).map(async (law) => {
    const result = await getSupabaseServerClient().from("questions").select("id", { count: "exact", head: true }).eq("lei_id", law.id).eq("ativo", true);
    if (result.error) throw new Error(`Não foi possível contar as questões ativas: ${result.error.message}`);
    return [law.slug, result.count ?? 0] as const;
  }));
  for (const [lawSlug, count] of results) counts.set(lawSlug, count);
  return counts;
}
