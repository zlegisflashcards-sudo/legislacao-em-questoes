import "server-only";

import { resolveContestImage } from "@/lib/contest-image";
import { getSupabaseServerClient } from "@/lib/supabase-server";
import { publicStudentName } from "@/lib/public-student-name";

type RankingRow = { posicao: number | string; aluno_id: string; score_total: number | string };
type ProductRow = Record<string, unknown> & { id: string; slug: string; nome: string; descricao: string | null; tipo_produto: string };
type LeagueRow = { produto_id: string | null; slug: string; nome: string; titulo: string; subtitulo: string | null; imagem_url: string | null; cta_label: string | null; cta_href: string | null };
export type RecordsRankingData = {
  contest: { productSlug: string; productType: string; shortName: string; productName: string; name: string; description: string | null; contestImageUrl: string | null; rankingHref: string };
  league: { slug: string; name: string; title: string; subtitle: string | null; bannerUrl: string | null; contestImageUrl: string | null; ctaLabel: string | null; ctaHref: string | null; productSlug: string | null };
  ranking: { position: number; publicName: string; score: number }[];
  personal: { position: number; score: number } | null;
};
export type RecordsContest = RecordsRankingData["contest"];

const numberValue = (value: number | string | null | undefined) => Number.isFinite(Number(value)) ? Number(value) : null;
const shortName = (slug: string) => slug.replace(/sd$/, "").toUpperCase();
const legacyLeagueSlug = (slug: string) => slug.replace(/sd$/, "");

async function legacyLeagueForProduct(product: Pick<ProductRow, "id" | "slug">) {
  const supabase = getSupabaseServerClient();
  const candidates = [...new Set([product.slug, legacyLeagueSlug(product.slug)])];
  const { data, error } = await supabase.from("ligas").select("produto_id,slug,nome,titulo,subtitulo,imagem_url,cta_label,cta_href").or(`produto_id.eq.${product.id},slug.in.(${candidates.join(",")})`);
  if (error) return null;
  const rows = (data ?? []) as LeagueRow[];
  return rows.find((league) => league.produto_id === product.id) ?? rows.find((league) => candidates.includes(league.slug)) ?? null;
}

function recordsContestForProduct(product: ProductRow, league: LeagueRow | null): RecordsContest {
  const contestImageUrl = resolveContestImage({
    productImage: typeof product.imagem_url === "string" ? product.imagem_url : null,
    leagueImage: league?.imagem_url,
  });

  return {
    productSlug: product.slug,
    productType: product.tipo_produto,
    shortName: shortName(product.slug),
    productName: product.nome,
    name: product.nome,
    description: product.descricao,
    contestImageUrl,
    rankingHref: `/recordes/${encodeURIComponent(product.slug)}`,
  };
}

async function hydrateRanking(rows: RankingRow[], studentId: string | null) {
  const ranked = rows.flatMap((row) => { const position = numberValue(row.posicao); const score = numberValue(row.score_total); return position && score !== null && typeof row.aluno_id === "string" ? [{ position, studentId: row.aluno_id, score }] : []; });
  const supabase = getSupabaseServerClient();
  const ids = [...new Set(ranked.map((entry) => entry.studentId))];
  const { data: students, error: studentsError } = ids.length ? await supabase.from("alunos").select("id,user_id,nome").in("id", ids) : { data: [], error: null };
  if (studentsError) throw new Error(`Não foi possível carregar os jogadores: ${studentsError.message}`);
  const studentById = new Map((students ?? []).map((student) => [String(student.id), student]));
  const userIds = [...new Set((students ?? []).map((student) => String(student.user_id ?? "")).filter(Boolean))];
  const { data: profiles, error: profilesError } = userIds.length ? await supabase.from("perfis_publicos").select("id,nome_publico").in("id", userIds) : { data: [], error: null };
  if (profilesError) throw new Error(`Não foi possível carregar os nomes públicos: ${profilesError.message}`);
  const publicNameByUser = new Map((profiles ?? []).filter((profile) => typeof profile.nome_publico === "string" && profile.nome_publico.trim()).map((profile) => [String(profile.id), String(profile.nome_publico).trim()]));
  const ranking = ranked.map((entry) => { const student = studentById.get(entry.studentId); return { position: entry.position, publicName: publicStudentName({ nome_publico: publicNameByUser.get(String(student?.user_id ?? "")), nome: student?.nome }), score: entry.score }; });
  const self = studentId ? ranked.find((entry) => entry.studentId === studentId) ?? null : null;
  return { ranking, personal: self ? { position: self.position, score: self.score } : null };
}

export async function loadRecordsRanking(slug: string, studentId: string | null = null): Promise<RecordsRankingData | null> {
  const supabase = getSupabaseServerClient();
  const { data: product, error: productError } = await supabase.from("produtos").select("*").eq("slug", slug).eq("ativo", true).eq("records_enabled", true).maybeSingle();
  if (productError) throw new Error(`Não foi possível carregar o produto do ranking: ${productError.message}`);
  if (!product) return null;
  const typedProduct = product as ProductRow;
  const [legacyLeague, rankingResult] = await Promise.all([
    legacyLeagueForProduct(typedProduct),
    supabase.rpc("obter_ranking_produto_records", { p_produto_slug: typedProduct.slug, p_aluno_id: studentId, p_limite: 10 }),
  ]);
  if (rankingResult.error) throw new Error(`Não foi possível carregar o ranking do produto: ${rankingResult.error.message}`);
  const league = legacyLeague;
  const contest = recordsContestForProduct(typedProduct, league);
  const hydrated = await hydrateRanking((rankingResult.data ?? []) as RankingRow[], studentId);
  return { contest, league: { slug: typedProduct.slug, name: typedProduct.nome, title: league?.titulo ?? "Ranking Legis Questões", subtitle: league?.subtitulo ?? null, bannerUrl: league?.imagem_url ?? null, contestImageUrl: contest.contestImageUrl, ctaLabel: league?.cta_label ?? "Ver produto", ctaHref: league?.cta_href ?? null, productSlug: typedProduct.slug }, ...hydrated };
}

export async function loadRecordsContests(): Promise<RecordsContest[]> {
  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase.from("produtos").select("*").eq("ativo", true).eq("records_enabled", true).not("slug", "is", null).order("ordem").order("nome");
  if (error) throw new Error(`Não foi possível carregar os concursos: ${error.message}`);
  const products = (data ?? []).filter((product): product is ProductRow => typeof product.slug === "string" && typeof product.id === "string" && typeof product.nome === "string");
  const leagues = await Promise.all(products.map((product) => legacyLeagueForProduct(product)));
  return products.map((product, index) => recordsContestForProduct(product, leagues[index]));
}
