import "server-only";

import { createSupabaseUserClient, getSupabaseServerClient } from "@/lib/supabase-server";
import { parseStudentLawRows, projectStudentLawContexts, type StudentLaw } from "@/lib/student-laws";
import { listLawStudyContextsByLaw } from "@/lib/law-question-scope-access";

export class StudentLawsApiError extends Error {
  constructor(public status: number, public publicMessage: string) {
    super(publicMessage);
  }
}

function bearerToken(request: Request) {
  const authorization = request.headers.get("authorization") ?? "";
  if (!authorization.startsWith("Bearer ")) return null;
  return authorization.slice(7).trim() || null;
}

export async function loadStudentLaws(request: Request): Promise<StudentLaw[]> {
  const url = new URL(request.url);
  if (url.searchParams.has("aluno_id")) {
    throw new StudentLawsApiError(400, "Parâmetro não permitido.");
  }

  const token = bearerToken(request);
  if (!token) throw new StudentLawsApiError(401, "Entre na sua conta para acessar suas leis.");

  const { data: userData, error: userError } = await getSupabaseServerClient().auth.getUser(token);
  if (userError || !userData.user) {
    throw new StudentLawsApiError(401, "Sua sessão expirou. Entre novamente.");
  }

  const { data: student, error: studentError } = await getSupabaseServerClient().from("alunos").select("id,deve_trocar_senha").eq("user_id", userData.user.id).maybeSingle();
  if (studentError) throw new StudentLawsApiError(503, "Não foi possível verificar seu acesso agora.");
  if (student?.deve_trocar_senha === true) throw new StudentLawsApiError(403, "Crie sua nova senha antes de acessar suas leis.");

  const { data, error } = await createSupabaseUserClient(token).rpc("obter_minhas_leis");
  if (error) throw new StudentLawsApiError(503, "Não foi possível carregar suas leis agora.");
  const laws = parseStudentLawRows(data);
  if (!student?.id || !laws.length) return laws;
  const contextsByLaw = await listLawStudyContextsByLaw(student.id, laws.map((law) => law.id));
  const { data: progress, error: progressError } = await getSupabaseServerClient().from("progresso_leis_alunos").select("lei_id,status_campanha,campanha_ativa_id").eq("aluno_id", student.id).in("lei_id", laws.map((law) => law.id));
  if (progressError) throw new StudentLawsApiError(503, `Não foi possível carregar o status dos Estudos Ativos da Lei: ${progressError.message}`);
  const map = new Map((progress ?? []).map((item) => [item.lei_id, item]));
  const activeIds = (progress ?? []).flatMap((item) => typeof item.campanha_ativa_id === "string" ? [item.campanha_ativa_id] : []);
  const { data: levels } = activeIds.length ? await getSupabaseServerClient().from("campanhas_leis_niveis").select("campanha_id,questoes_ids,concluido").in("campanha_id", activeIds) : { data: [] };
  const totals = new Map<string, { all: number; done: number }>();
  for (const level of levels ?? []) { const state = totals.get(level.campanha_id) ?? { all: 0, done: 0 }; const count = Array.isArray(level.questoes_ids) ? level.questoes_ids.length : 0; state.all += count; if (level.concluido) state.done += count; totals.set(level.campanha_id, state); }
  const lawsWithCampaign = laws.map((law) => { const item = map.get(law.id); const total = typeof item?.campanha_ativa_id === "string" ? totals.get(item.campanha_ativa_id) : null; return { ...law, campaignStatus: (item?.status_campanha as StudentLaw["campaignStatus"]) ?? "nao_iniciada", campaignProgress: total?.all ? Math.round(total.done / total.all * 100) : 0 }; });
  return projectStudentLawContexts(lawsWithCampaign, contextsByLaw);
}

export function studentLawsErrorResponse(error: unknown) {
  if (error instanceof StudentLawsApiError) {
    return Response.json({ success: false, message: error.publicMessage }, {
      status: error.status,
      headers: { "Cache-Control": "private, no-store, max-age=0" },
    });
  }
  console.error("Falha ao carregar leis do aluno", error instanceof Error ? error.message : "erro desconhecido");
  return Response.json({ success: false, message: "Não foi possível concluir a operação." }, {
    status: 500,
    headers: { "Cache-Control": "private, no-store, max-age=0" },
  });
}
