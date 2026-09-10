import "server-only";

import { resolveRecordsContestImage } from "@/lib/contest-image";
import { getSupabaseServerClient } from "@/lib/supabase-server";
import { publicStudentName } from "@/lib/public-student-name";

type RankingRow = { posicao: number | string; aluno_id: string; score_total: number | string };
type ProductRow = Record<string, unknown> & { id: string; slug: string; nome: string; descricao: string | null; tipo_produto: string };
type RawLawScore = { lei_id: number | string; slug: string; titulo: string; score: number | string };
type DetailsPayload = { top10?: RankingRow[]; current_user?: RankingRow | null; nearby?: RankingRow[]; laws?: RawLawScore[] };
export type RecordsEntry = { position: number; publicName: string; score: number; isCurrentUser: boolean };
export type RecordsLaw = { slug: string; name: string; score: number; hasAccess: boolean; href: string; actionLabel: "Estudar" | "Adquirir" };
export type RecordsRankingData = {
  contest: { productSlug: string; productType: string; shortName: string; productName: string; name: string; description: string | null; contestImageUrl: string | null; rankingHref: string };
  ranking: RecordsEntry[];
  personal: RecordsEntry | null;
  nearby: RecordsEntry[];
  laws: RecordsLaw[];
};
export type RecordsContest = RecordsRankingData["contest"];

const numberValue = (value: number | string | null | undefined) => Number.isFinite(Number(value)) ? Number(value) : null;
const shortName = (slug: string) => slug.replace(/sd$/, "").toUpperCase();
const asRows = (value: unknown) => Array.isArray(value) ? value as RankingRow[] : [];

function recordsContestForProduct(product: ProductRow): RecordsContest {
  return { productSlug: product.slug, productType: product.tipo_produto, shortName: shortName(product.slug), productName: product.nome, name: product.nome, description: product.descricao, contestImageUrl: resolveRecordsContestImage(typeof product.imagem_url === "string" ? product.imagem_url : null), rankingHref: `/recordes/${encodeURIComponent(product.slug)}` };
}

async function hydrateEntries(rows: RankingRow[], studentId: string | null) {
  const parsed = rows.flatMap((row) => { const position = numberValue(row.posicao); const score = numberValue(row.score_total); return position && score !== null && typeof row.aluno_id === "string" ? [{ position, studentId: row.aluno_id, score }] : []; });
  const ids = [...new Set(parsed.map((entry) => entry.studentId))]; const supabase = getSupabaseServerClient();
  const { data: students, error: studentsError } = ids.length ? await supabase.from("alunos").select("id,user_id,nome").in("id", ids) : { data: [], error: null };
  if (studentsError) throw new Error(`Não foi possível carregar os jogadores: ${studentsError.message}`);
  const studentById = new Map((students ?? []).map((student) => [String(student.id), student])); const userIds = [...new Set((students ?? []).map((student) => String(student.user_id ?? "")).filter(Boolean))];
  const { data: profiles, error: profilesError } = userIds.length ? await supabase.from("perfis_publicos").select("id,nome_publico").in("id", userIds) : { data: [], error: null };
  if (profilesError) throw new Error(`Não foi possível carregar os nomes públicos: ${profilesError.message}`);
  const nameByUser = new Map((profiles ?? []).filter((profile) => typeof profile.nome_publico === "string" && profile.nome_publico.trim()).map((profile) => [String(profile.id), String(profile.nome_publico).trim()]));
  return parsed.map((entry) => ({ position: entry.position, publicName: publicStudentName({ nome_publico: nameByUser.get(String(studentById.get(entry.studentId)?.user_id ?? "")), nome: studentById.get(entry.studentId)?.nome }), score: entry.score, isCurrentUser: entry.studentId === studentId }));
}

async function personalizedLaws(rows: unknown, studentId: string | null): Promise<RecordsLaw[]> {
  if (!studentId || !Array.isArray(rows)) return [];
  const laws = rows.flatMap((row) => { const value = row as Partial<RawLawScore>; const lawId = numberValue(value.lei_id); const score = numberValue(value.score); return lawId && typeof value.slug === "string" && typeof value.titulo === "string" && score !== null ? [{ lawId, slug: value.slug, name: value.titulo, score }] : []; });
  const lawIds = laws.map((law) => law.lawId); const supabase = getSupabaseServerClient();
  const [releasesResult, productsResult] = await Promise.all([
    lawIds.length ? supabase.from("liberacoes_leis").select("lei_id").eq("aluno_id", studentId).eq("status", "ativo").in("lei_id", lawIds) : Promise.resolve({ data: [], error: null }),
    lawIds.length ? supabase.from("produto_leis").select("lei_id,produtos(slug,tipo_produto,ativo)").in("lei_id", lawIds) : Promise.resolve({ data: [], error: null }),
  ]);
  if (releasesResult.error) throw new Error(`Não foi possível verificar os acessos: ${releasesResult.error.message}`); if (productsResult.error) throw new Error(`Não foi possível localizar os produtos das leis: ${productsResult.error.message}`);
  const accessible = new Set((releasesResult.data ?? []).map((release) => Number(release.lei_id))); const directProductByLaw = new Map<number, string>();
  for (const link of productsResult.data ?? []) { const product = Array.isArray(link.produtos) ? link.produtos[0] : link.produtos; if (product?.ativo && product.tipo_produto === "lei_avulsa" && typeof product.slug === "string" && !directProductByLaw.has(Number(link.lei_id))) directProductByLaw.set(Number(link.lei_id), product.slug); }
  return laws.map((law) => { const hasAccess = accessible.has(law.lawId); return { slug: law.slug, name: law.name, score: law.score, hasAccess, href: hasAccess ? `/estudar/lei/${encodeURIComponent(law.slug)}` : directProductByLaw.has(law.lawId) ? `/leisflashcards/${encodeURIComponent(directProductByLaw.get(law.lawId)!)}` : "/", actionLabel: hasAccess ? "Estudar" : "Adquirir" }; });
}

export async function loadRecordsRanking(slug: string, studentId: string | null = null): Promise<RecordsRankingData | null> {
  const supabase = getSupabaseServerClient(); const { data: product, error: productError } = await supabase.from("produtos").select("*").eq("slug", slug).eq("ativo", true).eq("records_enabled", true).maybeSingle();
  if (productError) throw new Error(`Não foi possível carregar o produto do ranking: ${productError.message}`); if (!product) return null;
  const typedProduct = product as ProductRow; const { data, error: detailsError } = await supabase.rpc("obter_detalhes_records_produto", { p_produto_slug: typedProduct.slug, p_aluno_id: studentId });
  if (detailsError) throw new Error(`Não foi possível carregar o ranking do produto: ${detailsError.message}`);
  const details = (data ?? {}) as DetailsPayload; const topRows = asRows(details.top10); const currentRow = details.current_user && typeof details.current_user === "object" ? [details.current_user] : [];
  const [ranking, current, nearby, laws] = await Promise.all([hydrateEntries(topRows, studentId), hydrateEntries(currentRow, studentId), hydrateEntries(asRows(details.nearby), studentId), personalizedLaws(details.laws, studentId)]); const contest = recordsContestForProduct(typedProduct);
  return { contest, ranking, personal: current[0] ?? null, nearby, laws };
}

export async function loadRecordsContests(): Promise<RecordsContest[]> {
  const supabase = getSupabaseServerClient(); const { data, error } = await supabase.from("produtos").select("*").eq("ativo", true).eq("records_enabled", true).not("slug", "is", null).order("ordem").order("nome");
  if (error) throw new Error(`Não foi possível carregar os concursos: ${error.message}`);
  const products = (data ?? []).filter((product): product is ProductRow => typeof product.slug === "string" && typeof product.id === "string" && typeof product.nome === "string" && typeof product.tipo_produto === "string");
  return products.map(recordsContestForProduct);
}
