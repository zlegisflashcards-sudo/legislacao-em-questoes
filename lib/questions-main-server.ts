import "server-only";

import { getSupabaseServerClient } from "@/lib/supabase-server";

export type MainQuestion = { id: string; lei_id: number; structure_id: number | null; pergunta: string; resposta: string; justificativa: string | null; assunto: string | null; legislacao: string | null; ordem: string; titulo: string | null; total_artigos: number | null; slug: string; ultima_alteracao_legislativa: string | null; capitulo: string | null; secao: string | null; subsecao: string | null; artigo: string | null; ativo: boolean };

export async function mainLawBySlug(slug: string) {
  const result = await getSupabaseServerClient().from("leis").select("id,slug,titulo,nome_curto,codigo,ativo").eq("slug", slug).eq("ativo", true).maybeSingle();
  if (result.error) throw new Error(`Não foi possível localizar a lei: ${result.error.message}`);
  return result.data;
}

export async function mainQuestions(leiId: number, filters: { structureIds?: number[]; values?: Record<string, string> } = {}) {
  // `ordem` é pedagógica e pode se repetir. created_at preserva a ordem de
  // cadastro; id fecha qualquer empate remanescente de forma determinística.
  let query = getSupabaseServerClient().from("questions").select("id,lei_id,structure_id,pergunta,resposta,justificativa,assunto,legislacao,ordem,titulo,total_artigos,slug,ultima_alteracao_legislativa,capitulo,secao,subsecao,artigo,ativo").eq("lei_id", leiId).eq("ativo", true).order("ordem").order("created_at").order("id");
  if (filters.structureIds?.length) query = query.in("structure_id", filters.structureIds);
  for (const [field, value] of Object.entries(filters.values ?? {})) if (["titulo", "capitulo", "secao", "subsecao"].includes(field)) query = query.eq(field, value);
  const result = await query;
  if (result.error) throw new Error(`Não foi possível carregar as questões: ${result.error.message}`);
  return (result.data ?? []) as MainQuestion[];
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
  const result = await getSupabaseServerClient().from("questions").select("id,lei_id,structure_id,pergunta,resposta,justificativa,assunto,legislacao,ordem,titulo,total_artigos,slug,ultima_alteracao_legislativa,capitulo,secao,subsecao,artigo,ativo").eq("lei_id", leiId).eq("ativo", true).in("id", uniqueIds);
  if (result.error) throw new Error(`Não foi possível carregar as questões: ${result.error.message}`);
  const byId = new Map((result.data ?? []).map((question) => [question.id, question as MainQuestion]));
  return uniqueIds.flatMap((id) => byId.get(id) ? [byId.get(id)!] : []);
}

export async function mainStructure(leiId: number) {
  const result = await getSupabaseServerClient().from("law_structure").select("id,lei_id,parent_id,tipo,nome,ordem,ativo,created_at,updated_at").eq("lei_id", leiId).eq("ativo", true).order("ordem").order("id");
  if (result.error) throw new Error(`Não foi possível carregar a estrutura: ${result.error.message}`);
  return result.data ?? [];
}

export async function mainActiveQuestionCountsBySlug(slugs: string[]) {
  const unique = [...new Set(slugs.map((slug) => slug.trim()).filter(Boolean))];
  const counts = new Map(unique.map((slug) => [slug, 0]));
  if (!unique.length) return counts;
  const { data: laws, error: lawsError } = await getSupabaseServerClient().from("leis").select("id,slug").in("slug", unique).eq("ativo", true);
  if (lawsError) throw new Error(`Não foi possível localizar as leis: ${lawsError.message}`);
  const results = await Promise.all((laws ?? []).map(async (law) => {
    const result = await getSupabaseServerClient().from("questions").select("id", { count: "exact", head: true }).eq("lei_id", law.id).eq("ativo", true);
    if (result.error) throw new Error(`Não foi possível contar as questões ativas: ${result.error.message}`);
    return [law.slug, result.count ?? 0] as const;
  }));
  for (const [lawSlug, count] of results) counts.set(lawSlug, count);
  return counts;
}
