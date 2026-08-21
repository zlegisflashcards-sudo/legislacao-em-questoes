import { isOfflineBuild } from "./build-mode";
import { getSupabaseServerClient } from "./supabase-server";

type CompletedCampaign = { aluno_id: string; score: number | null; score_ajustado?: number | null; concluida_em: string | null };

export type PublicLawRankingEntry = {
  position: number;
  publicName: string;
  score: number;
};

type RankedCampaign = { studentId: string; score: number; completedAt: string | null };

function compareRankedCampaigns(a: RankedCampaign, b: RankedCampaign) {
  if (b.score !== a.score) return b.score - a.score;
  const dateA = a.completedAt ? Date.parse(a.completedAt) : Number.MAX_SAFE_INTEGER;
  const dateB = b.completedAt ? Date.parse(b.completedAt) : Number.MAX_SAFE_INTEGER;
  if (dateA !== dateB) return dateA - dateB;
  return a.studentId.localeCompare(b.studentId);
}

/** Mantém o mesmo critério da RPC de resultado: melhor score, depois data do melhor score. */
export function rankCompletedLawCampaigns(campaigns: CompletedCampaign[]) {
  const bestByStudent = new Map<string, RankedCampaign>();

  for (const campaign of campaigns) {
    const effectiveScore = typeof campaign.score_ajustado === "number" ? campaign.score_ajustado : campaign.score;
    if (!campaign.aluno_id || typeof effectiveScore !== "number") continue;
    const candidate = { studentId: campaign.aluno_id, score: effectiveScore, completedAt: campaign.concluida_em };
    const current = bestByStudent.get(candidate.studentId);
    if (!current || compareRankedCampaigns(candidate, current) < 0) bestByStudent.set(candidate.studentId, candidate);
  }

  return [...bestByStudent.values()].sort(compareRankedCampaigns);
}

export async function loadPublicLawRanking(slug: string): Promise<PublicLawRankingEntry[]> {
  if (isOfflineBuild()) return [];

  try {
    const supabase = getSupabaseServerClient();
    const { data: law, error: lawError } = await supabase.from("leis").select("id").eq("slug", slug).eq("ativo", true).maybeSingle();
    if (lawError || !law) return [];

    const { data: campaigns, error: campaignsError } = await supabase
      .from("campanhas_leis_alunos")
      .select("aluno_id,score,score_ajustado,concluida_em")
      .eq("lei_id", law.id)
      .eq("concluida", true)
      .limit(5000);
    if (campaignsError) return [];

    const ranked = rankCompletedLawCampaigns((campaigns ?? []) as CompletedCampaign[]).slice(0, 10);
    if (!ranked.length) return [];

    const studentIds = ranked.map((entry) => entry.studentId);
    const { data: students, error: studentsError } = await supabase.from("alunos").select("id,user_id").in("id", studentIds);
    if (studentsError) return [];
    const userIdByStudentId = new Map((students ?? []).flatMap((student) => typeof student.id === "string" && typeof student.user_id === "string" ? [[student.id, student.user_id] as const] : []));
    const userIds = [...new Set([...userIdByStudentId.values()])];
    const { data: profiles, error: profilesError } = userIds.length ? await supabase.from("perfis_publicos").select("id,nome_publico").in("id", userIds) : { data: [], error: null };
    if (profilesError) return [];
    const publicNameByUserId = new Map((profiles ?? []).flatMap((profile) => typeof profile.id === "string" && typeof profile.nome_publico === "string" && profile.nome_publico.trim() ? [[profile.id, profile.nome_publico.trim()] as const] : []));

    return ranked.flatMap((entry, index) => {
      const name = publicNameByUserId.get(userIdByStudentId.get(entry.studentId) ?? "");
      return name ? [{ position: index + 1, publicName: name, score: entry.score }] : [];
    });
  } catch {
    return [];
  }
}
