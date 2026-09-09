import "server-only";

import { resolveContestImage } from "@/lib/contest-image";
import { getSupabaseServerClient } from "@/lib/supabase-server";
import { publicStudentName } from "@/lib/public-student-name";

type RankingRow = { posicao: number | string; aluno_id: string; score_total: number | string };
type ProductRow = Record<string, unknown> & { id: string; slug: string; nome: string; descricao: string | null };
type LeagueRow = { slug: string; nome: string; titulo: string; subtitulo: string | null; imagem_url: string | null; cta_label: string | null; cta_href: string | null };
export type RecordsRankingData = {
  contest: { slug: string; shortName: string; name: string; description: string | null; imageUrl: string | null };
  league: { slug: string; name: string; title: string; subtitle: string | null; bannerUrl: string | null; contestImageUrl: string | null; ctaLabel: string | null; ctaHref: string | null; productSlug: string | null };
  ranking: { position: number; publicName: string; score: number }[];
  personal: { position: number; score: number } | null;
};

const numberValue = (value: number | string | null | undefined) => Number.isFinite(Number(value)) ? Number(value) : null;
const shortName = (slug: string) => slug.replace(/sd$/, "").toUpperCase();

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
  const { data: product, error: productError } = await supabase.from("produtos").select("*").eq("slug", slug).eq("ativo", true).eq("tipo_produto", "edital").maybeSingle();
  if (productError) throw new Error(`Não foi possível carregar o produto do ranking: ${productError.message}`);
  if (!product) return null;
  const typedProduct = product as ProductRow;
  const [{ data: legacyLeague }, rankingResult] = await Promise.all([
    supabase.from("ligas").select("slug,nome,titulo,subtitulo,imagem_url,cta_label,cta_href").eq("produto_id", typedProduct.id).maybeSingle(),
    supabase.rpc("obter_ranking_produto_edital", { p_produto_slug: typedProduct.slug, p_aluno_id: studentId, p_limite: 10 }),
  ]);
  if (rankingResult.error) throw new Error(`Não foi possível carregar o ranking do produto: ${rankingResult.error.message}`);
  const league = legacyLeague as LeagueRow | null;
  const imageUrl = resolveContestImage({ productImage: typeof typedProduct.imagem_url === "string" ? typedProduct.imagem_url : null, leagueImage: league?.imagem_url });
  const hydrated = await hydrateRanking((rankingResult.data ?? []) as RankingRow[], studentId);
  return { contest: { slug: typedProduct.slug, shortName: shortName(typedProduct.slug), name: typedProduct.nome, description: typedProduct.descricao, imageUrl }, league: { slug: typedProduct.slug, name: typedProduct.nome, title: league?.titulo ?? "Ranking Legis Questões", subtitle: league?.subtitulo ?? null, bannerUrl: league?.imagem_url ?? null, contestImageUrl: imageUrl, ctaLabel: league?.cta_label ?? "Ver produto", ctaHref: league?.cta_href ?? null, productSlug: typedProduct.slug }, ...hydrated };
}

export async function loadRecordsRankings() {
  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase.from("produtos").select("slug").eq("ativo", true).eq("tipo_produto", "edital").not("slug", "is", null).order("ordem").order("nome");
  if (error) throw new Error(`Não foi possível carregar os concursos: ${error.message}`);
  const rankings = await Promise.all((data ?? []).flatMap((product) => typeof product.slug === "string" ? [loadRecordsRanking(product.slug)] : []));
  return rankings.filter((ranking): ranking is RecordsRankingData => Boolean(ranking));
}
