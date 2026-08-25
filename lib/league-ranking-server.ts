import "server-only";

import { getSupabaseServerClient } from "@/lib/supabase-server";

type RankingRow = { posicao: number | string; aluno_id: string; score_total: number | string };
type RankedLeagueEntry = { position: number; studentId: string; score: number };

export type LeagueRankingEntry = { position: number; publicName: string; score: number };
export type LeagueRankingData = {
  league: { slug: string; name: string; title: string };
  ranking: LeagueRankingEntry[];
  personal: { position: number; score: number } | null;
};

function numberValue(value: number | string | null | undefined) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

export async function loadLeagueRanking(slug: string, studentId: string | null = null): Promise<LeagueRankingData | null> {
  const supabase = getSupabaseServerClient();
  const { data: league, error: leagueError } = await supabase.from("ligas").select("id,slug,nome,titulo").eq("slug", slug).eq("ativo", true).maybeSingle();
  if (leagueError) throw new Error(`Não foi possível carregar a liga: ${leagueError.message}`);
  if (!league) return null;

  const { data: rows, error: rankingError } = await supabase.rpc("obter_ranking_liga", { p_liga_slug: slug, p_aluno_id: studentId, p_limite: 10 });
  if (rankingError) throw new Error(`Não foi possível carregar o ranking da liga: ${rankingError.message}`);
  const ranked: RankedLeagueEntry[] = (rows ?? []).flatMap((row: RankingRow) => {
    const position = numberValue(row.posicao); const score = numberValue(row.score_total);
    return position && typeof row.aluno_id === "string" && score !== null ? [{ position, studentId: row.aluno_id, score }] : [];
  });
  const studentIds = [...new Set(ranked.map((entry) => entry.studentId))];
  const { data: students, error: studentsError } = studentIds.length ? await supabase.from("alunos").select("id,user_id").in("id", studentIds) : { data: [], error: null };
  if (studentsError) throw new Error(`Não foi possível carregar os jogadores: ${studentsError.message}`);
  const userByStudent = new Map((students ?? []).flatMap((student) => typeof student.id === "string" && typeof student.user_id === "string" ? [[student.id, student.user_id] as const] : []));
  const userIds = [...new Set([...userByStudent.values()])];
  const { data: profiles, error: profilesError } = userIds.length ? await supabase.from("perfis_publicos").select("id,nome_publico").in("id", userIds) : { data: [], error: null };
  if (profilesError) throw new Error(`Não foi possível carregar os nomes públicos: ${profilesError.message}`);
  const nameByUser = new Map((profiles ?? []).flatMap((profile) => typeof profile.id === "string" && typeof profile.nome_publico === "string" && profile.nome_publico.trim() ? [[profile.id, profile.nome_publico.trim()] as const] : []));
  const ranking = ranked.filter((entry) => entry.position <= 10).map((entry) => ({ position: entry.position, publicName: nameByUser.get(userByStudent.get(entry.studentId) ?? "") ?? "Jogador Legis", score: entry.score }));
  const self = studentId ? ranked.find((entry) => entry.studentId === studentId) ?? null : null;
  return { league: { slug: league.slug, name: league.nome, title: league.titulo }, ranking, personal: self ? { position: self.position, score: self.score } : null };
}

function bearerToken(request: Request) {
  const authorization = request.headers.get("authorization") ?? "";
  return authorization.startsWith("Bearer ") ? authorization.slice(7).trim() || null : null;
}

export async function studentIdFromLeagueRequest(request: Request) {
  const token = bearerToken(request);
  if (!token) return null;
  const supabase = getSupabaseServerClient();
  const { data: userData, error } = await supabase.auth.getUser(token);
  if (error || !userData.user) return null;
  const { data: student } = await supabase.from("alunos").select("id").eq("user_id", userData.user.id).maybeSingle();
  return typeof student?.id === "string" ? student.id : null;
}
