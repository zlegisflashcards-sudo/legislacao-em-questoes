import "server-only";

import { obterAdministrador } from "@/lib/admin-auth";
import { invalidateLevelCompletionMessagesCache } from "@/lib/level-completion-messages-server";
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

type CompletionMessageInput = { texto: string; ativo: boolean; ordem: number };

function completionMessageInput(input: unknown, partial = false): Partial<CompletionMessageInput> {
  const body = typeof input === "object" && input !== null && !Array.isArray(input) ? input as Record<string, unknown> : {};
  const allowed = ["texto", "ativo", "ordem"];
  if (Object.keys(body).some((key) => !allowed.includes(key))) throw new CoachAdminError(400, "Campos da mensagem de conclusão inválidos.");
  const next: Partial<CompletionMessageInput> = {};
  if ("texto" in body) {
    const texto = text(body.texto);
    if (!texto) throw new CoachAdminError(400, "Informe o texto da mensagem de conclusão.");
    next.texto = texto;
  }
  if ("ativo" in body) {
    if (typeof body.ativo !== "boolean") throw new CoachAdminError(400, "Informe se a mensagem está ativa.");
    next.ativo = body.ativo;
  }
  if ("ordem" in body) {
    if (typeof body.ordem !== "number" || !Number.isInteger(body.ordem) || body.ordem < 0) throw new CoachAdminError(400, "Informe uma ordem válida para a mensagem.");
    next.ordem = body.ordem;
  }
  if (!partial && (next.texto === undefined || next.ativo === undefined || next.ordem === undefined)) throw new CoachAdminError(400, "Preencha texto, estado e ordem da mensagem.");
  if (partial && !Object.keys(next).length) throw new CoachAdminError(400, "Informe ao menos um campo para atualizar.");
  return next;
}

function messageId(value: unknown) {
  const id = typeof value === "string" ? Number(value) : typeof value === "number" ? value : NaN;
  if (!Number.isSafeInteger(id) || id <= 0) throw new CoachAdminError(400, "Mensagem de conclusão inválida.");
  return id;
}

function messageRpcError(error: { code?: string | null; message?: string | null }) {
  if (["22023", "P0002"].includes(String(error.code))) return new CoachAdminError(422, error.message || "A mensagem de conclusão não pode ser alterada.");
  if (String(error.code) === "42501") return new CoachAdminError(403, "Operação administrativa não autorizada.");
  return new CoachAdminError(503, "Não foi possível salvar a mensagem de conclusão agora.");
}

export async function coachCompletionMessages() {
  await requireAdmin();
  const { data, error } = await getSupabaseServerClient().from("mensagens_conclusao_niveis").select("id,texto,ativo,ordem,created_at,updated_at").order("ordem", { ascending: true }).order("id", { ascending: true });
  if (error) throw new CoachAdminError(503, "Não foi possível carregar as mensagens de conclusão.");
  return { items: data ?? [] };
}

export async function createCompletionMessage(input: unknown) {
  const admin = await requireAdmin();
  const data = completionMessageInput(input) as CompletionMessageInput;
  const { data: saved, error } = await getSupabaseServerClient().rpc("admin_criar_mensagem_conclusao_nivel", { p_ator_user_id: admin.id, p_texto: data.texto, p_ativo: data.ativo, p_ordem: data.ordem });
  if (error) throw messageRpcError(error);
  invalidateLevelCompletionMessagesCache();
  return saved;
}

export async function updateCompletionMessage(idValue: unknown, input: unknown) {
  const admin = await requireAdmin();
  const id = messageId(idValue);
  const data = completionMessageInput(input, true);
  const { data: saved, error } = await getSupabaseServerClient().rpc("admin_atualizar_mensagem_conclusao_nivel", { p_ator_user_id: admin.id, p_mensagem_id: id, p_dados: data });
  if (error) throw messageRpcError(error);
  invalidateLevelCompletionMessagesCache();
  return saved;
}

export async function deleteCompletionMessage(idValue: unknown) {
  const admin = await requireAdmin();
  const id = messageId(idValue);
  const { data, error } = await getSupabaseServerClient().rpc("admin_excluir_mensagem_conclusao_nivel", { p_ator_user_id: admin.id, p_mensagem_id: id });
  if (error) throw messageRpcError(error);
  invalidateLevelCompletionMessagesCache();
  return data;
}

export async function coachStudents(url: URL) {
  await requireAdmin();
  const page = Math.max(1, Number(url.searchParams.get("page")) || 1);
  const limit = Math.min(50, Math.max(1, Number(url.searchParams.get("limit")) || 25));
  const filter = url.searchParams.get("filter") ?? "todos";
  const query = text(url.searchParams.get("q")).toLowerCase();
  // Na visão inicial, a atividade é a ordem pedagógica mais útil para o Coach.
  // A paginação só pode acontecer depois de calcular essa atividade para todos.
  const orderByStudyActivity = filter === "todos" && !query;
  const supabase = getSupabaseServerClient();
  let studentsQuery = supabase.from("alunos").select("id,nome,email", { count: "exact" });
  if (query) {
    const pattern = `%${query.replace(/[%_]/g, "\\$&")}%`;
    studentsQuery = studentsQuery.or(`nome.ilike.${pattern},email.ilike.${pattern}`);
  }
  studentsQuery = studentsQuery.order("nome");
  if (!orderByStudyActivity) {
    studentsQuery = studentsQuery.range((page - 1) * limit, page * limit - 1);
  }
  const { data: students, error, count } = await studentsQuery;
  if (error) throw new CoachAdminError(503, "Não foi possível carregar os alunos.");
  const selected = students ?? [];
  const ids = selected.map((student) => student.id);
  const { data: campaigns, error: campaignsError } = ids.length ? await supabase.from("campanhas_leis_alunos").select("id,aluno_id,lei_id,total_erros,score,score_ajustado,score_version,concluida,concluida_em,updated_at,leis(titulo,slug)").in("aluno_id", ids).eq("score_version", 2) : { data: [], error: null };
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
  if (!orderByStudyActivity) return { items, page, limit, total: count ?? items.length };
  const ordered = items.sort((a, b) => {
    const right = b.lastActivity ? Date.parse(b.lastActivity) : Number.NEGATIVE_INFINITY;
    const left = a.lastActivity ? Date.parse(a.lastActivity) : Number.NEGATIVE_INFINITY;
    return right - left || a.name.localeCompare(b.name, "pt-BR");
  });
  const start = (page - 1) * limit;
  return { items: ordered.slice(start, start + limit), page, limit, total: count ?? ordered.length };
}

export async function coachStudent(studentId: string) {
  await requireAdmin();
  const supabase = getSupabaseServerClient();
  const { data: student, error } = await supabase.from("alunos").select("id,nome,email").eq("id", studentId).maybeSingle();
  if (error || !student) throw new CoachAdminError(404, "Aluno não encontrado.");
  const { data: campaigns, error: campaignsError } = await supabase.from("campanhas_leis_alunos").select("id,aluno_id,lei_id,total_erros,score,score_ajustado,score_version,concluida,concluida_em,updated_at,leis(titulo,slug)").eq("aluno_id", studentId).eq("score_version", 2).order("updated_at", { ascending: false });
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
