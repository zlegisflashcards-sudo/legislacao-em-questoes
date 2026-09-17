import "server-only";

import { resolveRecordsContestImage } from "@/lib/contest-image";
import { getSupabaseServerClient } from "@/lib/supabase-server";
import { publicStudentName } from "@/lib/public-student-name";

type RankingRow = { posicao: number | string; aluno_id: string; score_total: number | string };
type ProductRow = Record<string, unknown> & { id: string; slug: string; nome: string; descricao: string | null; tipo_produto: string };
type RawLawScore = { lei_id: number | string; slug: string; titulo: string; score: number | string };
type DetailsPayload = { top10?: RankingRow[]; current_user?: RankingRow | null; nearby?: RankingRow[]; laws?: RawLawScore[] };
export type RecordsEntry = { position: number; publicName: string; score: number; isCurrentUser: boolean };
export type RecordsPublicLaw = { slug: string; name: string; href: string; actionLabel: "Adquirir" };
export type RecordsLaw = Omit<RecordsPublicLaw, "actionLabel"> & { score: number; hasAccess: boolean; actionLabel: "Estudar" | "Adquirir" };
type RecordsRankingBase = {
  contest: { productSlug: string; productType: string; shortName: string; productName: string; name: string; description: string | null; contestImageUrl: string | null; rankingHref: string; productHref: string };
  ranking: RecordsEntry[];
};
export type RecordsPublicRankingData = RecordsRankingBase & {
  laws: RecordsPublicLaw[];
};
export type RecordsRankingData = RecordsRankingBase & {
  personal: RecordsEntry | null;
  nearby: RecordsEntry[];
  laws: RecordsLaw[];
};
export type RecordsContest = RecordsRankingData["contest"];

const numberValue = (value: number | string | null | undefined) => Number.isFinite(Number(value)) ? Number(value) : null;
const shortName = (slug: string) => slug.replace(/sd$/, "").toUpperCase();
const asRows = (value: unknown) => Array.isArray(value) ? value as RankingRow[] : [];

function recordsContestForProduct(product: ProductRow): RecordsContest {
  return { productSlug: product.slug, productType: product.tipo_produto, shortName: shortName(product.slug), productName: product.nome, name: product.nome, description: product.descricao, contestImageUrl: resolveRecordsContestImage(typeof product.imagem_url === "string" ? product.imagem_url : null), rankingHref: `/recordes/${encodeURIComponent(product.slug)}`, productHref: `/leisflashcards/${encodeURIComponent(product.slug)}` };
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

type ResolvedLaw = { lawId: number; slug: string; name: string; score: number };

async function lawsWithProducts(rows: unknown): Promise<{ laws: ResolvedLaw[]; purchaseHrefByLaw: Map<number, string> }> {
  if (!Array.isArray(rows)) return { laws: [], purchaseHrefByLaw: new Map() };
  const laws = rows.flatMap((row) => { const value = row as Partial<RawLawScore>; const lawId = numberValue(value.lei_id); const score = numberValue(value.score); return lawId && typeof value.slug === "string" && typeof value.titulo === "string" && score !== null ? [{ lawId, slug: value.slug, name: value.titulo, score }] : []; });
  const lawIds = laws.map((law) => law.lawId); const supabase = getSupabaseServerClient(); const { data: products, error } = lawIds.length ? await supabase.from("produto_leis").select("lei_id,produtos(slug,tipo_produto,ativo)").in("lei_id", lawIds) : { data: [], error: null };
  if (error) throw new Error(`Não foi possível localizar os produtos das leis: ${error.message}`);
  const purchaseHrefByLaw = new Map<number, string>();
  for (const link of products ?? []) { const product = Array.isArray(link.produtos) ? link.produtos[0] : link.produtos; if (product?.ativo && product.tipo_produto === "lei_avulsa" && typeof product.slug === "string" && !purchaseHrefByLaw.has(Number(link.lei_id))) purchaseHrefByLaw.set(Number(link.lei_id), `/leisflashcards/${encodeURIComponent(product.slug)}`); }
  return { laws, purchaseHrefByLaw };
}

async function recordsLaws(rows: unknown): Promise<RecordsPublicLaw[]> {
  const resolved = await lawsWithProducts(rows);
  return resolved.laws.map((law) => ({ slug: law.slug, name: law.name, href: resolved.purchaseHrefByLaw.get(law.lawId) ?? "/", actionLabel: "Adquirir" }));
}

async function personalizedRecordsLaws(rows: unknown, studentId: string): Promise<RecordsLaw[]> {
  const resolved = await lawsWithProducts(rows); const lawIds = resolved.laws.map((law) => law.lawId); const releasesResult = lawIds.length ? await getSupabaseServerClient().from("liberacoes_leis").select("lei_id").eq("aluno_id", studentId).eq("status", "ativo").in("lei_id", lawIds) : { data: [], error: null };
  if (releasesResult.error) throw new Error(`Não foi possível verificar os acessos: ${releasesResult.error.message}`);
  const accessible = new Set((releasesResult.data ?? []).map((release) => Number(release.lei_id)));
  return resolved.laws.map((law) => { const hasAccess = accessible.has(law.lawId); return { slug: law.slug, name: law.name, score: law.score, hasAccess, href: hasAccess ? `/estudar/lei/${encodeURIComponent(law.slug)}` : resolved.purchaseHrefByLaw.get(law.lawId) ?? "/", actionLabel: hasAccess ? "Estudar" : "Adquirir" }; });
}

export async function loadRecordsRanking(slug: string, studentId: string | null = null): Promise<RecordsPublicRankingData | RecordsRankingData | null> {
  const supabase = getSupabaseServerClient(); const { data: product, error: productError } = await supabase.from("produtos").select("*").eq("slug", slug).eq("ativo", true).eq("records_enabled", true).maybeSingle();
  if (productError) throw new Error(`Não foi possível carregar o produto do ranking: ${productError.message}`); if (!product) return null;
  const typedProduct = product as ProductRow; const { data, error: detailsError } = await supabase.rpc("obter_detalhes_records_produto", { p_produto_slug: typedProduct.slug, p_aluno_id: studentId });
  if (detailsError) throw new Error(`Não foi possível carregar o ranking do produto: ${detailsError.message}`);
  const details = (data ?? {}) as DetailsPayload; const topRows = asRows(details.top10); const contest = recordsContestForProduct(typedProduct);
  if (!studentId) { const [ranking, laws] = await Promise.all([hydrateEntries(topRows, null), recordsLaws(details.laws)]); return { contest, ranking, laws }; }
  const currentRow = details.current_user && typeof details.current_user === "object" ? [details.current_user] : [];
  const [ranking, current, nearby, laws] = await Promise.all([hydrateEntries(topRows, studentId), hydrateEntries(currentRow, studentId), hydrateEntries(asRows(details.nearby), studentId), personalizedRecordsLaws(details.laws, studentId)]);
  return { contest, ranking, personal: current[0] ?? null, nearby, laws };
}

export async function loadRecordsContests(): Promise<RecordsContest[]> {
  const supabase = getSupabaseServerClient(); const { data, error } = await supabase.from("produtos").select("*").eq("ativo", true).eq("records_enabled", true).not("slug", "is", null).order("ordem").order("nome");
  if (error) throw new Error(`Não foi possível carregar os concursos: ${error.message}`);
  const products = (data ?? []).filter((product): product is ProductRow => typeof product.slug === "string" && typeof product.id === "string" && typeof product.nome === "string" && typeof product.tipo_produto === "string");
  return products.map(recordsContestForProduct);
}
