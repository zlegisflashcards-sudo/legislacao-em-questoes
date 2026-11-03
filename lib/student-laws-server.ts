import "server-only";

import { createSupabaseUserClient, getSupabaseServerClient } from "@/lib/supabase-server";
import { parseStudentLawRows, projectStudentLawContexts, type StudentLaw } from "@/lib/student-laws";

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

  // These reads do not depend on one another.  Keeping them serial made the
  // library wait for two network round trips before it could even begin to
  // assemble the student's cards.
  const db = getSupabaseServerClient();
  const [studentResult, lawsResult] = await Promise.all([
    db.from("alunos").select("id,deve_trocar_senha").eq("user_id", userData.user.id).maybeSingle(),
    createSupabaseUserClient(token).rpc("obter_minhas_leis"),
  ]);
  const { data: student, error: studentError } = studentResult;
  if (studentError) throw new StudentLawsApiError(503, "Não foi possível verificar seu acesso agora.");
  if (student?.deve_trocar_senha === true) throw new StudentLawsApiError(403, "Crie sua nova senha antes de acessar suas leis.");

  const { data, error } = lawsResult;
  if (error) throw new StudentLawsApiError(503, "Não foi possível carregar suas leis agora.");
  const laws = parseStudentLawRows(data);
  if (!student?.id || !laws.length) return laws;
  const lawIds = laws.map((law) => law.id);
  const [progressResult, campaignsResult] = await Promise.all([
    db.from("progresso_leis_alunos").select("lei_id,status_campanha,campanha_ativa_id").eq("aluno_id", student.id).in("lei_id", lawIds),
    db.from("campanhas_leis_alunos").select("id,lei_id,concluida,concluida_em").eq("aluno_id", student.id).in("lei_id", lawIds).eq("abandonada", false).order("concluida_em", { ascending: false }),
  ]);
  const { data: progress, error: progressError } = progressResult;
  if (progressError) throw new StudentLawsApiError(503, `Não foi possível carregar o status dos Estudos Ativos da Lei: ${progressError.message}`);
  const map = new Map((progress ?? []).map((item) => [item.lei_id, item]));
  const { data: campaigns, error: campaignsError } = campaignsResult;
  if (campaignsError) throw new StudentLawsApiError(503, "Não foi possível carregar as respostas dos Estudos Ativos da Lei.");
  const campaignsById = new Map((campaigns ?? []).map((campaign) => [campaign.id, campaign]));
  const referenceCampaignByLaw = new Map<number, string>();
  for (const law of laws) { const active = map.get(law.id)?.campanha_ativa_id; const latest = (campaigns ?? []).find((campaign) => campaign.lei_id === law.id && campaign.concluida); const id = typeof active === "string" && campaignsById.has(active) ? active : latest?.id; if (id) referenceCampaignByLaw.set(law.id, id); }
  const referenceIds = [...new Set(referenceCampaignByLaw.values())];
  const { data: answers, error: answersError } = referenceIds.length ? await getSupabaseServerClient().from("campanhas_leis_respostas").select("campanha_id,questao_id").in("campanha_id", referenceIds) : { data: [], error: null };
  if (answersError) throw new StudentLawsApiError(503, "Não foi possível carregar as respostas dos Estudos Ativos da Lei.");
  const answeredByCampaign = new Map<string, Set<string>>();
  for (const answer of answers ?? []) if (typeof answer.questao_id === "string") answeredByCampaign.set(answer.campanha_id, new Set([...(answeredByCampaign.get(answer.campanha_id) ?? []), answer.questao_id]));
  // A biblioteca precisa responder rápido mesmo para leis com milhares de
  // questões. A contagem integral já vem da RPC autorizada; o universo exato
  // de cada recorte continua sendo carregado somente ao abrir a página da lei.
  const contextsByLaw = new Map(laws.map((law) => [law.id, [{ recorteId: null, nome: "Lei completa", questionCount: law.totalFlashcards, availability: "ready" as const }]]));
  const lawsWithCampaign = laws.map((law) => ({ ...law, campaignStatus: (map.get(law.id)?.status_campanha as StudentLaw["campaignStatus"]) ?? "nao_iniciada", campaignProgress: 0 }));
  return projectStudentLawContexts(lawsWithCampaign, contextsByLaw).map((law) => {
    const campaignId = referenceCampaignByLaw.get(law.id);
    const answered = campaignId ? answeredByCampaign.get(campaignId) ?? new Set<string>() : new Set<string>();
    const total = law.totalFlashcards;
    const campaignStatus = law.campaignStatus === "concluida" || (total > 0 && answered.size >= total) ? "concluida" : law.campaignStatus;
    return { ...law, campaignStatus, campaignProgress: campaignStatus === "concluida" ? 100 : total ? Math.round(answered.size / total * 100) : 0 };
  });
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
