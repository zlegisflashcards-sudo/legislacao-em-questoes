import "server-only";

import { cookies } from "next/headers";
import { createSupabaseUserClient, getSupabaseServerClient } from "@/lib/supabase-server";
import { mergeAdministratorLawCatalog, parseStudentLawRows, projectStudentLawContexts, type StudentLaw } from "@/lib/student-laws";
import { listLawStudyContextsByLaw } from "@/lib/law-question-scope-access";
import { adminCookieNames, obterAdministrador, usuarioEhAdministrador } from "@/lib/admin-auth";

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

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function materialDate(value: unknown) {
  return typeof value === "string" ? value : "";
}

async function loadActiveLawCatalog(): Promise<StudentLaw[]> {
  const supabase = getSupabaseServerClient();
  const [{ data: lawData, error: lawError }, { data: materialData, error: materialError }] = await Promise.all([
    supabase.from("leis").select("id,slug,titulo,nome_curto,descricao,codigo,categoria,thumbnail_url,ordem,situacao_atualizacao,houve_alteracao_legislativa,ultima_alteracao_referencia,norma_originaria_referencia").eq("ativo", true).order("ordem", { ascending: true }).order("titulo", { ascending: true }).order("id", { ascending: true }),
    supabase.from("materiais_leis").select("id,lei_id,quantidade_itens,versao_material,revisado_em,publicado_em,ordem").eq("ativo", true).eq("tipo", "flashcards"),
  ]);
  if (lawError || materialError) throw new StudentLawsApiError(503, "Não foi possível carregar as leis disponíveis agora.");

  const materialsByLaw = new Map<number, Record<string, unknown>[]>();
  for (const value of materialData ?? []) {
    const material = record(value);
    const lawId = Number(material?.lei_id);
    if (!material || !Number.isSafeInteger(lawId)) continue;
    const current = materialsByLaw.get(lawId) ?? [];
    current.push(material);
    materialsByLaw.set(lawId, current);
  }

  const rows = (lawData ?? []).flatMap((value) => {
    const law = record(value);
    const lawId = Number(law?.id);
    if (!law || !Number.isSafeInteger(lawId)) return [];
    const materials = (materialsByLaw.get(lawId) ?? []).sort((left, right) =>
      materialDate(right.publicado_em).localeCompare(materialDate(left.publicado_em))
      || materialDate(right.revisado_em).localeCompare(materialDate(left.revisado_em))
      || Number(left.ordem ?? 0) - Number(right.ordem ?? 0)
      || Number(right.id ?? 0) - Number(left.id ?? 0)
    );
    const latest = materials[0];
    const totalFlashcards = materials.reduce((total, material) => {
      const quantity = Number(material.quantidade_itens);
      return total + (Number.isSafeInteger(quantity) && quantity >= 0 ? quantity : 0);
    }, 0);
    const changed = law.houve_alteracao_legislativa === true;
    return [{
      id: law.id,
      slug: law.slug,
      titulo: law.titulo,
      nome_curto: law.nome_curto,
      descricao: law.descricao,
      codigo: law.codigo,
      categoria: law.categoria,
      thumbnail_url: law.thumbnail_url,
      ordem: law.ordem,
      fontes_ativas: 0,
      total_flashcards: totalFlashcards,
      versao_material: latest?.versao_material ?? null,
      revisado_em: latest?.revisado_em ?? null,
      publicado_em: latest?.publicado_em ?? null,
      situacao_atualizacao: law.situacao_atualizacao,
      houve_alteracao_legislativa: changed,
      referencia_normativa_atual: changed ? law.ultima_alteracao_referencia : law.norma_originaria_referencia,
      tipo_referencia_normativa: changed ? "alteracao" : "originaria",
    }];
  });
  return parseStudentLawRows(rows);
}

export async function loadStudentLaws(request: Request): Promise<StudentLaw[]> {
  const url = new URL(request.url);
  const includeAdministratorCatalog = url.searchParams.get("visao") === "minhas-leis";
  if (url.searchParams.has("aluno_id")) {
    throw new StudentLawsApiError(400, "Parâmetro não permitido.");
  }

  const token = bearerToken(request);
  const bearer = token ? await getSupabaseServerClient().auth.getUser(token) : { data: { user: null }, error: null };
  const bearerUser = bearer.error ? null : bearer.data.user;
  const cookieAdministrator = bearerUser ? null : await obterAdministrador();
  const administrator = usuarioEhAdministrador(bearerUser) ? bearerUser : cookieAdministrator;
  const authenticatedUser = bearerUser ?? administrator;
  if (!authenticatedUser) {
    throw new StudentLawsApiError(401, "Sua sessão expirou. Entre novamente.");
  }

  const isAdministrator = Boolean(administrator);
  const { data: student, error: studentError } = await getSupabaseServerClient().from("alunos").select("id,deve_trocar_senha").eq("user_id", authenticatedUser.id).maybeSingle();
  if (studentError) throw new StudentLawsApiError(503, "Não foi possível verificar seu acesso agora.");
  if (!isAdministrator && student?.deve_trocar_senha === true) throw new StudentLawsApiError(403, "Crie sua nova senha antes de acessar suas leis.");

  const cookieToken = isAdministrator && !bearerUser ? (await cookies()).get(adminCookieNames.access)?.value ?? null : null;
  const authenticatedToken = bearerUser ? token : cookieToken;
  if (!authenticatedToken) throw new StudentLawsApiError(401, "Sua sessão expirou. Entre novamente.");
  const { data, error } = await createSupabaseUserClient(authenticatedToken).rpc("obter_minhas_leis");
  if (error) throw new StudentLawsApiError(503, "Não foi possível carregar suas leis agora.");
  const laws = student?.deve_trocar_senha === true ? [] : parseStudentLawRows(data);
  const contextsByLaw = student?.id && laws.length ? await listLawStudyContextsByLaw(student.id, laws.map((law) => law.id)) : new Map();
  const { data: progress, error: progressError } = student?.id && laws.length ? await getSupabaseServerClient().from("progresso_leis_alunos").select("lei_id,status_campanha,campanha_ativa_id").eq("aluno_id", student.id).in("lei_id", laws.map((law) => law.id)) : { data: [], error: null };
  if (progressError) throw new StudentLawsApiError(503, `Não foi possível carregar o status dos Estudos Ativos da Lei: ${progressError.message}`);
  const map = new Map((progress ?? []).map((item) => [item.lei_id, item]));
  const activeIds = (progress ?? []).flatMap((item) => typeof item.campanha_ativa_id === "string" ? [item.campanha_ativa_id] : []);
  const { data: levels } = activeIds.length ? await getSupabaseServerClient().from("campanhas_leis_niveis").select("campanha_id,questoes_ids,concluido").in("campanha_id", activeIds) : { data: [] };
  const totals = new Map<string, { all: number; done: number }>();
  for (const level of levels ?? []) { const state = totals.get(level.campanha_id) ?? { all: 0, done: 0 }; const count = Array.isArray(level.questoes_ids) ? level.questoes_ids.length : 0; state.all += count; if (level.concluido) state.done += count; totals.set(level.campanha_id, state); }
  const lawsWithCampaign = laws.map((law) => { const item = map.get(law.id); const total = typeof item?.campanha_ativa_id === "string" ? totals.get(item.campanha_ativa_id) : null; return { ...law, campaignStatus: (item?.status_campanha as StudentLaw["campaignStatus"]) ?? "nao_iniciada", campaignProgress: total?.all ? Math.round(total.done / total.all * 100) : 0 }; });
  const studentContexts = projectStudentLawContexts(lawsWithCampaign, contextsByLaw);
  if (!isAdministrator || !includeAdministratorCatalog) return studentContexts;
  return mergeAdministratorLawCatalog(studentContexts, await loadActiveLawCatalog());
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
