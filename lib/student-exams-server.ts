import "server-only";

import { createSupabaseUserClient, getSupabaseServerClient } from "@/lib/supabase-server";
import { parseStudentExams, type StudentExam } from "@/lib/student-exams";

export class StudentExamError extends Error { constructor(public status: number, public publicMessage: string) { super(publicMessage); } }

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
  const { data: progress, error: progressError } = await getSupabaseServerClient().from("progresso_leis_alunos").select("lei_id,status_campanha").eq("aluno_id", studentId).in("lei_id", lawIds);
  if (progressError) throw new StudentExamError(503, "Não foi possível carregar o progresso do edital agora.");
  const states = new Map((progress ?? []).map((item) => [item.lei_id, item.status_campanha]));
  return exams.map((exam) => ({ ...exam, leis: exam.leis.map((law) => ({ ...law, campaignStatus: states.get(law.id) === "concluida" || states.get(law.id) === "em_andamento" ? states.get(law.id)! : "nao_iniciada" })) }));
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
  const map: Record<string, { fn: string; args: Record<string, unknown> }> = {
    rename: { fn: "atualizar_nome_meu_edital", args: { p_nome: payload.nome } },
    add: { fn: "adicionar_lei_meu_edital", args: { p_lei_id: payload.leiId } },
    remove: { fn: "remover_lei_meu_edital", args: { p_lei_id: payload.leiId } },
    reorder: { fn: "reordenar_meu_edital", args: { p_leis: payload.leiIds } },
  };
  const call = map[action];
  if (!call) throw new StudentExamError(400, "Ação inválida.");
  const { error } = await client.rpc(call.fn, call.args);
  if (error) throw new StudentExamError(error.code === "42501" ? 403 : 400, error.code === "42501" ? "Você não possui acesso a esta lei." : "Não foi possível salvar o edital.");
}

export function studentExamErrorResponse(error: unknown) {
  const status = error instanceof StudentExamError ? error.status : 500;
  const message = error instanceof StudentExamError ? error.publicMessage : "Não foi possível concluir a operação.";
  return Response.json({ success: false, message }, { status, headers: { "Cache-Control": "private, no-store, max-age=0" } });
}
