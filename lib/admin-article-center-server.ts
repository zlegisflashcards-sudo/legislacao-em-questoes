import "server-only";

import { exigirAdministrador } from "@/lib/admin-auth";
import { getSupabaseServerClient } from "@/lib/supabase-server";
import type { LegisBotComentario } from "@/lib/legisbot-comentario";

const LIMIT = 40;

export type ArticleContext = LegisBotComentario & { lawTitle: string | null; lawCode: string | null; commentsCount: number; questionsCount: number };
export type ArticleInteraction = { id: string; kind: "comentario" | "legisbot"; slug: string; ordem: string; author: string | null; summary: string; status: string; createdAt: string };
export type ArticleQuestion = { id: string; slug: string; ordem: string; pergunta: string; resposta: string; assunto: string | null; titulo: string | null; structure_id: number | null; ativo: boolean; updated_at: string };

export function normalizeArticleSearch(value: string) {
  return value.trim().slice(0, 120).replace(/[,%()]/g, " ").replace(/\s+/g, " ");
}

async function lawMetadata(slugs: string[]) {
  if (!slugs.length) return new Map<string, { title: string; code: string | null }>();
  const result = await getSupabaseServerClient().from("leis").select("slug,titulo,codigo").in("slug", slugs.map((slug) => slug.toLowerCase()));
  if (result.error) throw new Error("Não foi possível carregar os dados das leis.");
  return new Map((result.data ?? []).map((law) => [String(law.slug).toUpperCase(), { title: String(law.titulo), code: law.codigo ? String(law.codigo) : null }]));
}

async function commentCounts(contexts: Array<Pick<LegisBotComentario, "slug" | "ordem">>) {
  const db = getSupabaseServerClient();
  const counts = new Map<string, number>();
  await Promise.all(contexts.map(async (item) => {
    const result = await db.from("legisbot_comentarios_comunidade").select("id", { count: "exact", head: true }).eq("slug", item.slug).eq("ordem", item.ordem);
    if (result.error) throw new Error("Não foi possível contar os comentários da comunidade.");
    counts.set(`${item.slug}:${item.ordem}`, result.count ?? 0);
  }));
  return counts;
}

async function questionCounts(contexts: Array<Pick<LegisBotComentario, "slug" | "ordem">>) {
  const db = getSupabaseServerClient();
  const counts = new Map<string, number>();
  await Promise.all(contexts.map(async (item) => {
    const result = await db.from("questions").select("id", { count: "exact", head: true }).eq("slug", item.slug.toLowerCase()).eq("ordem", item.ordem).eq("ativo", true);
    if (result.error) throw new Error("Não foi possível contar as questões vinculadas.");
    counts.set(`${item.slug}:${item.ordem}`, result.count ?? 0);
  }));
  return counts;
}

export async function searchArticleContexts(rawQuery: string): Promise<ArticleContext[]> {
  await exigirAdministrador();
  const query = normalizeArticleSearch(rawQuery);
  if (!query) return [];
  const db = getSupabaseServerClient();
  const laws = await db.from("leis").select("slug").or(`slug.ilike.%${query}%,titulo.ilike.%${query}%,nome_curto.ilike.%${query}%,codigo.ilike.%${query}%`).limit(LIMIT);
  if (laws.error) throw new Error("Não foi possível pesquisar as leis.");
  const matchingSlugs = (laws.data ?? []).map((law) => String(law.slug).toUpperCase());
  const terms = [`slug.ilike.%${query}%`, `ordem.ilike.%${query}%`, `titulo.ilike.%${query}%`, `assunto.ilike.%${query}%`];
  if (matchingSlugs.length) terms.unshift(`slug.in.(${matchingSlugs.join(",")})`);
  const request = db.from("legisbot_comentarios").select("*").or(terms.join(","));
  const result = await request.order("updated_at", { ascending: false }).limit(LIMIT);
  if (result.error) throw new Error("Não foi possível pesquisar os artigos do LegisBot.");
  return enrichContexts((result.data ?? []) as LegisBotComentario[]);
}

export async function getArticleContext(slug: string, ordem: string): Promise<ArticleContext | null> {
  await exigirAdministrador();
  const result = await getSupabaseServerClient().from("legisbot_comentarios").select("*").eq("slug", slug.toUpperCase()).eq("ordem", ordem).maybeSingle();
  if (result.error) throw new Error("Não foi possível carregar o artigo.");
  if (!result.data) return null;
  return (await enrichContexts([result.data as LegisBotComentario]))[0] ?? null;
}

async function enrichContexts(records: LegisBotComentario[]): Promise<ArticleContext[]> {
  const [laws, counts, questions] = await Promise.all([lawMetadata([...new Set(records.map((item) => item.slug))]), commentCounts(records), questionCounts(records)]);
  return records.map((item) => ({ ...item, lawTitle: laws.get(item.slug)?.title ?? null, lawCode: laws.get(item.slug)?.code ?? null, commentsCount: counts.get(`${item.slug}:${item.ordem}`) ?? 0, questionsCount: questions.get(`${item.slug}:${item.ordem}`) ?? 0 }));
}

export async function getLatestArticleInteractions(): Promise<ArticleInteraction[]> {
  await exigirAdministrador();
  const db = getSupabaseServerClient();
  const [comments, legisbot] = await Promise.all([
    db.from("legisbot_comentarios_comunidade").select("id,user_id,slug,ordem,conteudo,status,created_at").order("created_at", { ascending: false }).limit(30),
    db.from("legisbot_comentarios").select("id,slug,ordem,titulo,assunto,status,created_at").order("created_at", { ascending: false }).limit(30),
  ]);
  if (comments.error || legisbot.error) throw new Error("Não foi possível carregar as últimas interações.");
  const rows = comments.data ?? [];
  const ids = [...new Set(rows.map((row) => String(row.user_id)))];
  const profiles = ids.length ? await db.from("perfis_publicos").select("id,nome_publico").in("id", ids) : { data: [], error: null };
  if (profiles.error) throw new Error("Não foi possível carregar os perfis públicos.");
  const names = new Map((profiles.data ?? []).map((profile) => [String(profile.id), String(profile.nome_publico)]));
  const communityInteractions = rows.map((row) => ({ id: String(row.id), kind: "comentario" as const, slug: String(row.slug), ordem: String(row.ordem), author: names.get(String(row.user_id)) ?? "Estudante Legis", summary: row.conteudo ? String(row.conteudo).slice(0, 180) : "Comentário removido.", status: String(row.status), createdAt: String(row.created_at) }));
  const legisbotInteractions = (legisbot.data ?? []).map((row) => ({ id: String(row.id), kind: "legisbot" as const, slug: String(row.slug), ordem: String(row.ordem), author: null, summary: `Solicitação de explicação: ${String(row.assunto || row.titulo)}`, status: String(row.status), createdAt: String(row.created_at) }));
  return [...communityInteractions, ...legisbotInteractions].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 30);
}

export async function getArticleCommunityComments(slug: string, ordem: string, filters: { q?: string; author?: string; status?: string; reported?: boolean } = {}) {
  await exigirAdministrador();
  const db = getSupabaseServerClient();
  const q = normalizeArticleSearch(filters.q ?? "");
  const author = normalizeArticleSearch(filters.author ?? "");
  let authorIds: string[] | null = null;
  if (author) {
    const profileResult = await db.from("perfis_publicos").select("id").ilike("nome_publico", `%${author}%`).limit(200);
    if (profileResult.error) throw new Error("Não foi possível pesquisar os perfis públicos.");
    authorIds = (profileResult.data ?? []).map((profile) => String(profile.id));
  }
  let reportedIds: string[] | null = null;
  if (filters.reported) {
    const reportResult = await db.from("legisbot_comentarios_denuncias").select("comentario_id").in("status", ["pendente", "em_analise"]).limit(1000);
    if (reportResult.error) throw new Error("Não foi possível consultar as denúncias.");
    reportedIds = [...new Set((reportResult.data ?? []).map((report) => String(report.comentario_id)))];
  }
  let request = db.from("legisbot_comentarios_comunidade").select("*").eq("slug", slug.toUpperCase()).eq("ordem", ordem);
  if (q) request = request.or(`conteudo.ilike.%${q}%,trecho_citado.ilike.%${q}%`);
  if (filters.status) request = request.eq("status", filters.status);
  if (authorIds) request = authorIds.length ? request.in("user_id", authorIds) : request.eq("user_id", "00000000-0000-0000-0000-000000000000");
  if (reportedIds) request = reportedIds.length ? request.in("id", reportedIds) : request.eq("id", "00000000-0000-0000-0000-000000000000");
  const result = await request.order("created_at", { ascending: false }).limit(100);
  if (result.error) throw new Error("Não foi possível carregar os comentários do artigo.");
  const rows = result.data ?? [];
  const ids = [...new Set(rows.map((row) => String(row.user_id)))];
  const profiles = ids.length ? await db.from("perfis_publicos").select("id,nome_publico").in("id", ids) : { data: [], error: null };
  const reports = rows.length ? await db.from("legisbot_comentarios_denuncias").select("comentario_id,status").in("comentario_id", rows.map((row) => String(row.id))) : { data: [], error: null };
  if (profiles.error || reports.error) throw new Error("Não foi possível carregar os dados de moderação.");
  const names = new Map((profiles.data ?? []).map((profile) => [String(profile.id), String(profile.nome_publico)]));
  const reported = new Map<string, number>();
  for (const report of reports.data ?? []) if (["pendente", "em_analise"].includes(String(report.status))) reported.set(String(report.comentario_id), (reported.get(String(report.comentario_id)) ?? 0) + 1);
  return rows.map((row) => ({ ...row, author: names.get(String(row.user_id)) ?? "Estudante Legis", reports: reported.get(String(row.id)) ?? 0 }));
}

export async function getArticleQuestions(slug: string, ordem: string): Promise<ArticleQuestion[]> {
  await exigirAdministrador();
  const result = await getSupabaseServerClient().from("questions").select("id,slug,ordem,pergunta,resposta,assunto,titulo,structure_id,ativo,updated_at").eq("slug", slug.toLowerCase()).eq("ordem", ordem).eq("ativo", true).order("updated_at", { ascending: false }).limit(100);
  if (result.error) throw new Error("Não foi possível carregar as questões do artigo.");
  return (result.data ?? []) as ArticleQuestion[];
}

export async function getRecentArticleContexts() {
  const interactions = await getLatestArticleInteractions();
  const unique = [...new Map(interactions.map((item) => [`${item.slug}:${item.ordem}`, item])).values()].slice(0, 12);
  const contexts = await Promise.all(unique.map((item) => getArticleContext(item.slug, item.ordem)));
  return contexts.flatMap((context, index) => context ? [{ ...context, lastInteraction: unique[index] }] : []);
}
