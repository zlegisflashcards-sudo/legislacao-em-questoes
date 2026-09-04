import "server-only";

import { createSupabaseUserClient, getSupabaseServerClient } from "@/lib/supabase-server";
import { parseStudentExams, selectExamReferenceCampaign, summarizeExamLawProgress, type StudentExam } from "@/lib/student-exams";
import { listLawStudyContextsByLaw } from "@/lib/law-question-scope-access";

export class StudentExamError extends Error { constructor(public status: number, public publicMessage: string) { super(publicMessage); } }
const isUuid = (value: unknown): value is string => typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);

async function context(request: Request) {
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) throw new StudentExamError(401, "Entre na sua conta para acessar seus editais.");
  const admin = getSupabaseServerClient();
  const { data, error } = await admin.auth.getUser(token);
  if (error || !data.user) throw new StudentExamError(401, "Sua sessão expirou. Entre novamente.");
  const { data: student, error: studentError } = await admin.from("alunos").select("id").eq("user_id", data.user.id).maybeSingle();
  if (studentError || !student) throw new StudentExamError(503, "Não foi possível verificar seus editais agora.");
  return { client: createSupabaseUserClient(token), studentId: student.id };
}

export async function loadStudentExams(request: Request): Promise<StudentExam[]> {
  const { client, studentId } = await context(request);
  const { data, error } = await client.rpc("obter_meus_editais");
  if (error) throw new StudentExamError(503, "Não foi possível carregar seus editais agora.");
  const exams = parseStudentExams(data);
  const lawIds = [...new Set(exams.flatMap((exam) => exam.leis.map((law) => law.id)))];
  if (!lawIds.length) return exams;
  const scopeIds = [...new Set(exams.flatMap((exam) => exam.leis.flatMap((law) => law.recorteId ? [law.recorteId] : [])))];
  const [progressResult, scopesResult, contextsByLaw] = await Promise.all([
    getSupabaseServerClient().from("progresso_leis_alunos").select("lei_id,status_campanha,campanha_ativa_id").eq("aluno_id", studentId).in("lei_id", lawIds),
    scopeIds.length ? getSupabaseServerClient().from("recortes_leis").select("id,nome").in("id", scopeIds) : Promise.resolve({ data: [], error: null }),
    listLawStudyContextsByLaw(studentId, lawIds),
  ]);
  const { data: progress, error: progressError } = progressResult;
  if (progressError) throw new StudentExamError(503, "Não foi possível carregar o progresso do edital agora.");
  if (scopesResult.error) throw new StudentExamError(503, "Não foi possível carregar os contextos do edital agora.");
  const states = new Map((progress ?? []).map((item) => [item.lei_id, item]));
  const scopeNames = new Map((scopesResult.data ?? []).map((scope) => [scope.id, scope.nome]));
  const { data: campaigns, error: campaignsError } = await getSupabaseServerClient().from("campanhas_leis_alunos").select("id,lei_id,concluida,concluida_em").eq("aluno_id", studentId).eq("score_version", 2).eq("abandonada", false).in("lei_id", lawIds).order("concluida_em", { ascending: false });
  if (campaignsError) throw new StudentExamError(503, "Não foi possível carregar o progresso do edital agora.");
  const campaignsById = new Map((campaigns ?? []).map((campaign) => [campaign.id, campaign]));
  const campaignsByLaw = new Map<number, Array<{ id: string; concluida: boolean }>>();
  for (const campaign of campaigns ?? []) campaignsByLaw.set(campaign.lei_id, [...(campaignsByLaw.get(campaign.lei_id) ?? []), campaign]);
  const referenceByLaw = new Map<number, string>();
  for (const lawId of lawIds) {
    const state = states.get(lawId);
    const reference = selectExamReferenceCampaign(state ? { status: state.status_campanha, campaignId: typeof state.campanha_ativa_id === "string" && campaignsById.has(state.campanha_ativa_id) ? state.campanha_ativa_id : null } : undefined, (campaignsByLaw.get(lawId) ?? []).map((campaign) => ({ id: campaign.id, concluded: campaign.concluida })));
    if (reference) referenceByLaw.set(lawId, reference);
  }
  const referenceIds = [...new Set(referenceByLaw.values())];
  const { data: answerRows, error: answersError } = referenceIds.length ? await getSupabaseServerClient().from("campanhas_leis_respostas").select("campanha_id,questao_id,correta,respondido_em,id").in("campanha_id", referenceIds).order("respondido_em", { ascending: false }).order("id", { ascending: false }) : { data: [], error: null };
  if (answersError) throw new StudentExamError(503, "Não foi possível carregar o progresso do edital agora.");
  const answersByCampaign = new Map<string, Array<{ questionId: string; correct: boolean }>>();
  for (const answer of answerRows ?? []) if (typeof answer.campanha_id === "string" && typeof answer.questao_id === "string" && typeof answer.correta === "boolean") answersByCampaign.set(answer.campanha_id, [...(answersByCampaign.get(answer.campanha_id) ?? []), { questionId: answer.questao_id, correct: answer.correta }]);
  return exams.map((exam) => ({ ...exam, leis: exam.leis.map((law) => {
    const state = states.get(law.id);
    const context = (contextsByLaw.get(law.id) ?? []).find((item) => item.recorteId === law.recorteId);
    const campaignId = referenceByLaw.get(law.id);
    return { ...law, recorteNome: law.recorteId ? scopeNames.get(law.recorteId) ?? null : null, campaignStatus: state?.status_campanha === "concluida" || state?.status_campanha === "em_andamento" ? state.status_campanha : "nao_iniciada", progress: summarizeExamLawProgress(context?.questionIds ?? [], campaignId ? answersByCampaign.get(campaignId) ?? [] : []) };
  }) }));
}

export async function loadStudentExamSelection(request: Request) {
  const { studentId } = await context(request);
  const [editais, { data: active, error }] = await Promise.all([
    loadStudentExams(request),
    getSupabaseServerClient().from("alunos_editais_ativos").select("edital_tipo,edital_id").eq("aluno_id", studentId).maybeSingle(),
  ]);
  if (error) throw new StudentExamError(503, "Não foi possível carregar o edital em estudo agora.");
  return { editais, editalAtivo: active ? { id: active.edital_id, tipo: active.edital_tipo } : null };
}

async function setActiveStudentExam(request: Request, payload: Record<string, unknown>) {
  const { studentId } = await context(request);
  if (typeof payload.id !== "string" || (payload.tipo !== "produto" && payload.tipo !== "personalizado")) throw new StudentExamError(400, "Edital inválido.");
  const allowed = await loadStudentExams(request);
  if (!allowed.some((exam) => exam.id === payload.id && exam.tipo === payload.tipo)) throw new StudentExamError(403, "Edital indisponível.");
  const { error } = await getSupabaseServerClient().from("alunos_editais_ativos").upsert({ aluno_id: studentId, edital_tipo: payload.tipo, edital_id: payload.id, updated_at: new Date().toISOString() });
  if (error) throw new StudentExamError(503, "Não foi possível salvar o edital em estudo.");
}

export async function mutateStudentExam(request: Request, action: string, payload: Record<string, unknown>) {
  if (action === "set-active") return setActiveStudentExam(request, payload);
  const { client } = await context(request);
  const lawId = Number(payload.leiId);
  if (["add", "remove"].includes(action) && (!Number.isSafeInteger(lawId) || lawId < 1)) throw new StudentExamError(400, "Lei inválida.");
  if (action === "add" && payload.recorteId != null && !isUuid(payload.recorteId)) throw new StudentExamError(400, "Recorte inválido.");
  const map: Record<string, { fn: string; args: Record<string, unknown> }> = {
    rename: { fn: "atualizar_nome_meu_edital", args: { p_nome: payload.nome } },
    add: { fn: "definir_contexto_lei_meu_edital", args: { p_lei_id: lawId, p_recorte_id: payload.recorteId ?? null, p_confirmar_substituicao: payload.confirmReplace === true } },
    remove: { fn: "remover_lei_meu_edital", args: { p_lei_id: lawId } },
    reorder: { fn: "reordenar_meu_edital", args: { p_leis: payload.leiIds } },
  };
  const call = map[action];
  if (!call) throw new StudentExamError(400, "Ação inválida.");
  const { error } = await client.rpc(call.fn, call.args);
  if (error) {
    if (error.code === "42501") throw new StudentExamError(403, "Você não possui acesso a este contexto de estudo.");
    if (error.code === "22023" && error.message.includes("outro contexto")) throw new StudentExamError(409, "Esta lei já está no seu edital com outro contexto.");
    throw new StudentExamError(400, "Não foi possível salvar o edital.");
  }
}

export function studentExamErrorResponse(error: unknown) {
  const status = error instanceof StudentExamError ? error.status : 500;
  const message = error instanceof StudentExamError ? error.publicMessage : "Não foi possível concluir a operação.";
  return Response.json({ success: false, message }, { status, headers: { "Cache-Control": "private, no-store, max-age=0" } });
}
