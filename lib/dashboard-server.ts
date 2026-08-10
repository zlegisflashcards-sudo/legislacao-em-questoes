import "server-only";

import type { User } from "@supabase/supabase-js";
import { parseDailyReviewRpc, type DashboardData, type DailyReviewState } from "@/lib/dashboard";
import { createSupabaseUserClient, getSupabaseServerClient } from "@/lib/supabase-server";

export class DashboardApiError extends Error {
  constructor(public status: number, public publicMessage: string) {
    super(publicMessage);
  }
}

export function bearerToken(request: Request) {
  const header = request.headers.get("authorization") ?? "";
  if (!header.startsWith("Bearer ")) return null;
  const token = header.slice(7).trim();
  return token || null;
}

export async function requireDashboardUser(request: Request): Promise<{ user: User; token: string }> {
  const token = bearerToken(request);
  if (!token) throw new DashboardApiError(401, "Entre na sua conta para acessar o painel.");
  const { data, error } = await getSupabaseServerClient().auth.getUser(token);
  if (error || !data.user) throw new DashboardApiError(401, "Sua sessão expirou. Entre novamente.");
  const { data: student, error: studentError } = await getSupabaseServerClient().from("alunos").select("deve_trocar_senha").eq("user_id", data.user.id).maybeSingle();
  if (studentError) throw new DashboardApiError(503, "Não foi possível verificar seu acesso agora.");
  if (student?.deve_trocar_senha === true) throw new DashboardApiError(403, "Crie sua nova senha antes de acessar o painel.");
  return { user: data.user, token };
}

export async function loadDashboardData(request: Request): Promise<DashboardData> {
  const { user, token } = await requireDashboardUser(request);
  const client = createSupabaseUserClient(token);
  const [profileResult, reviewResult] = await Promise.all([
    client.from("perfis_publicos").select("nome_publico").eq("id", user.id).maybeSingle(),
    client.rpc("obter_sequencia_revisao"),
  ]);
  if (profileResult.error || reviewResult.error) {
    throw new DashboardApiError(503, "Não foi possível carregar o painel agora.");
  }

  return {
    nomePublico: typeof profileResult.data?.nome_publico === "string" ? profileResult.data.nome_publico : null,
    // Ainda não existe uma estrutura consolidada de editais/progresso no projeto.
    editalAtivo: null,
    revisao: parseDailyReviewRpc(reviewResult.data),
  };
}

export async function registerDailyReview(request: Request): Promise<DailyReviewState> {
  const { token } = await requireDashboardUser(request);
  const client = createSupabaseUserClient(token);
  const { data, error } = await client.rpc("registrar_revisao_diaria");
  if (error) throw new DashboardApiError(503, "Não foi possível registrar a revisão agora.");
  return parseDailyReviewRpc(data);
}

export function dashboardErrorResponse(error: unknown) {
  if (error instanceof DashboardApiError) {
    return Response.json({ success: false, message: error.publicMessage }, { status: error.status });
  }
  console.error("Falha no dashboard", error instanceof Error ? error.message : "erro desconhecido");
  return Response.json({ success: false, message: "Não foi possível concluir a operação." }, { status: 500 });
}
