import "server-only";

import { obterAdministrador } from "@/lib/admin-auth";
import { getSupabaseServerClient } from "@/lib/supabase-server";

export class CoachAdminError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

function text(value: unknown) { return typeof value === "string" ? value.trim() : ""; }
function effectiveScore(row: { score: number | null; score_ajustado?: number | null }) {
  return typeof row.score_ajustado === "number" ? row.score_ajustado : row.score;
}
async function requireAdmin() {
  const admin = await obterAdministrador();
  if (!admin) throw new CoachAdminError(401, "Autenticação administrativa obrigatória.");
  return admin;
}

export async function coachStudents(url: URL) {
  await requireAdmin();
  const page = Math.max(1, Number(url.searchParams.get("page")) || 1);
  const limit = Math.min(50, Math.max(1, Number(url.searchParams.get("limit")) || 25));
  const filter = url.searchParams.get("filter") ?? "todos";
  const query = text(url.searchParams.get("q")).toLowerCase();
  const supabase = getSupabaseServerClient();
  let studentsQuery = supabase.from("alunos").select("id,nome,email", { count: "exact" });
  if (query) {
    const pattern = `%${query.replace(/[%_]/g, "\\$&")}%`;
    studentsQuery = studentsQuery.or(`nome.ilike.${pattern},email.ilike.${pattern}`);
  }
  const { data: students, error, count } = await studentsQuery
    .order("nome")
    .range((page - 1) * limit, page * limit - 1);
  if (error) throw new CoachAdminError(503, "Não foi possível carregar os alunos.");
  const selected = students ?? [];
  const ids = selected.map((student) => student.id);
  const { data: campaigns, error: campaignsError } = ids.length ? await supabase.from("campanhas_leis_alunos").select("id,aluno_id,lei_id,total_erros,score,score_ajustado,concluida,concluida_em,updated_at,leis(titulo,slug)").in("aluno_id", ids) : { data: [], error: null };
  if (campaignsError) throw new CoachAdminError(503, "Não foi possível carregar as campanhas.");
  const threeDaysAgo = Date.now() - 3 * 86400000;
  const items = selected.map((student) => {
    const own = (campaigns ?? []).filter((campaign) => campaign.aluno_id === student.id);
    const active = own.filter((campaign) => !campaign.concluida).sort((a, b) => String(b.updated_at).localeCompare(String(a.updated_at)))[0] ?? null;
    const last = own.map((campaign) => String(campaign.updated_at ?? campaign.concluida_em ?? "")).sort().at(-1) || null;
    const completed = own.filter((campaign) => campaign.concluida).length;
    const activeAt = last ? Date.parse(last) : NaN;
    const state = !last ? "nunca_iniciou" : activeAt >= threeDaysAgo ? "ativo" : "parado";
    const law = active && !Array.isArray(active.leis) ? active.leis : Array.isArray(active?.leis) ? active?.leis[0] : null;
    return { id: student.id, name: text(student.nome) || "Aluno sem nome", email: text(student.email), state, lastActivity: last, completedCampaigns: completed, currentLaw: active ? { title: text(law?.titulo) || "Lei", slug: text(law?.slug), score: effectiveScore(active), errors: active.total_erros } : null };
  }).filter((item) => filter === "todos" || (filter === "concluiu" ? item.completedCampaigns > 0 : item.state === filter));
  return { items, page, limit, total: count ?? items.length };
}

export async function coachStudent(studentId: string) {
  await requireAdmin();
  const supabase = getSupabaseServerClient();
  const { data: student, error } = await supabase.from("alunos").select("id,nome,email").eq("id", studentId).maybeSingle();
  if (error || !student) throw new CoachAdminError(404, "Aluno não encontrado.");
  const { data: campaigns, error: campaignsError } = await supabase.from("campanhas_leis_alunos").select("id,aluno_id,lei_id,total_erros,score,score_ajustado,concluida,concluida_em,updated_at,leis(titulo,slug)").eq("aluno_id", studentId).order("updated_at", { ascending: false });
  if (campaignsError) throw new CoachAdminError(503, "Não foi possível carregar as campanhas.");
  return { student, campaigns: (campaigns ?? []).map((campaign) => ({ ...campaign, score_efetivo: effectiveScore(campaign) })) };
}

export async function adjustCampaignScore(input: unknown) {
  const admin = await requireAdmin();
  const body = typeof input === "object" && input !== null ? input as Record<string, unknown> : {};
  const campaignId = text(body.campaignId);
  const reason = text(body.reason);
  const score = typeof body.score === "number" && Number.isInteger(body.score) ? body.score : NaN;
  if (!/^[0-9a-f-]{36}$/i.test(campaignId) || !reason || reason.length > 1000 || !Number.isInteger(score) || score < 0 || score > 10000) throw new CoachAdminError(400, "Informe um score válido entre 0 e 10.000 e o motivo do ajuste.");
  const { data, error } = await getSupabaseServerClient().rpc("admin_ajustar_score_campanha", { p_ator_user_id: admin.id, p_campanha_id: campaignId, p_novo_score: score, p_motivo: reason });
  if (error) {
    if (["22023", "P0002"].includes(String(error.code))) throw new CoachAdminError(422, error.message || "O ajuste não é permitido.");
    if (String(error.code) === "42501") throw new CoachAdminError(403, "Operação administrativa não autorizada.");
    throw new CoachAdminError(503, "Não foi possível ajustar o score agora.");
  }
  return data;
}

export function coachErrorResponse(error: unknown) {
  const status = error instanceof CoachAdminError ? error.status : 500;
  const message = error instanceof CoachAdminError ? error.message : "Não foi possível concluir a operação do Painel de Coach.";
  return Response.json({ message }, { status, headers: { "Cache-Control": "private, no-store, max-age=0" } });
}
