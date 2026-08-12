import "server-only";

import type { User } from "@supabase/supabase-js";
import { examStates, percentage, type DashboardData, type DashboardEdital, parseDailyReviewRpc, type DailyReviewState } from "@/lib/dashboard";
import { loadStudentExamSelection } from "@/lib/student-exams-server";
import { createSupabaseUserClient, getSupabaseServerClient } from "@/lib/supabase-server";

export class DashboardApiError extends Error {
  constructor(public status: number, public publicMessage: string) { super(publicMessage); }
}

export function bearerToken(request: Request) {
  const value = request.headers.get("authorization") ?? "";
  return value.startsWith("Bearer ") ? value.slice(7).trim() || null : null;
}

export async function requireDashboardUser(request: Request): Promise<{ user: User; token: string; studentId: string }> {
  const token = bearerToken(request);
  if (!token) throw new DashboardApiError(401, "Entre na sua conta para acessar o painel.");
  const admin = getSupabaseServerClient();
  const { data, error } = await admin.auth.getUser(token);
  if (error || !data.user) throw new DashboardApiError(401, "Sua sessão expirou.");
  const { data: student, error: studentError } = await admin.from("alunos").select("id,deve_trocar_senha").eq("user_id", data.user.id).maybeSingle();
  if (studentError || !student) throw new DashboardApiError(503, "Não foi possível verificar seu acesso agora.");
  if (student.deve_trocar_senha) throw new DashboardApiError(403, "Crie sua nova senha antes de acessar o painel.");
  return { user: data.user, token, studentId: student.id };
}

function toDashboardExam(exam: import("@/lib/student-exams").StudentExam): DashboardEdital {
  const estados = examStates(exam.leis);
  return { id: exam.id, tipo: exam.tipo, nome: exam.nome, leis: exam.leis.length, estados, progresso: percentage(estados.revisao, exam.leis.length), url: exam.tipo === "personalizado" ? "/meu-edital" : `/meu-edital?edital=${encodeURIComponent(exam.id)}` };
}

export async function loadDashboardData(request: Request): Promise<DashboardData> {
  const { user, token } = await requireDashboardUser(request);
  const [{ editais: allExams, editalAtivo: active }, { data: profile }] = await Promise.all([
    loadStudentExamSelection(request),
    createSupabaseUserClient(token).from("perfis_publicos").select("nome_publico").eq("id", user.id).maybeSingle(),
  ]);
  const exams = allExams.filter((exam) => !(exam.tipo === "personalizado" && exam.id === "0" && exam.leis.length === 0));
  const list = exams.map(toDashboardExam);
  const persisted = active ? list.find((exam) => exam.id === active.id && exam.tipo === active.tipo) : null;
  return { nomePublico: typeof profile?.nome_publico === "string" ? profile.nome_publico : null, editais: list, editalAtivo: persisted ?? (list.length === 1 ? list[0] : null) };
}

// Used by the separate review flow; it is intentionally not rendered in the new dashboard.
export async function registerDailyReview(request: Request): Promise<DailyReviewState> {
  const { token } = await requireDashboardUser(request);
  const { data, error } = await createSupabaseUserClient(token).rpc("registrar_revisao_diaria");
  if (error) throw new DashboardApiError(503, "Não foi possível registrar a revisão agora.");
  return parseDailyReviewRpc(data);
}

export function dashboardErrorResponse(error: unknown) {
  const status = error instanceof DashboardApiError ? error.status : 500;
  const message = error instanceof DashboardApiError ? error.publicMessage : "Não foi possível concluir a operação.";
  return Response.json({ success: false, message }, { status, headers: { "Cache-Control": "no-store" } });
}
