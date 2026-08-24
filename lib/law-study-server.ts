import "server-only";

import { getSupabaseServerClient } from "@/lib/supabase-server";
import { isValidLawSlug, lawStudyShortName, type LawStudyData, type LawStudyHistoryItem, type LawStudyMaterial } from "@/lib/law-study";
import { materialAccessReference } from "@/lib/law-material-download";
import { activeQuestionCountBySlug } from "@/lib/question-counts-server";

export class LawStudyApiError extends Error {
  constructor(public status: number, public publicMessage: string) {
    super(publicMessage);
  }
}

export const PUBLIC_SAMPLE_LAW_SLUG = "cf0800";

function bearerToken(request: Request) {
  const authorization = request.headers.get("authorization") ?? "";
  if (!authorization.startsWith("Bearer ")) return null;
  return authorization.slice(7).trim() || null;
}

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function text(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function positiveInteger(value: unknown) {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 ? value : null;
}

export function parseLawStudyMaterials(value: unknown): LawStudyMaterial[] {
  if (!Array.isArray(value)) return [];
  const allowedTypes = new Set<LawStudyMaterial["type"]>(["flashcards", "video", "pdf", "tutorial", "audio", "outro"]);
  const allowedActions = new Set<LawStudyMaterial["action"]>(["abrir", "baixar", "assistir"]);

  return value.flatMap((item) => {
    const row = record(item);
    const id = positiveInteger(row?.id);
    const type = text(row?.tipo) as LawStudyMaterial["type"] | null;
    const title = text(row?.titulo);
    const action = text(row?.acao) as LawStudyMaterial["action"] | null;
    const source = text(row?.url_externa);
    if (id === null || !type || !allowedTypes.has(type) || !title || !action || !allowedActions.has(action)) return [];
    const access = materialAccessReference(text(row?.provedor), action, source);
    return [{
      id,
      type,
      title,
      description: text(row?.descricao),
      action,
      itemCount: positiveInteger(row?.quantidade_itens),
      version: text(row?.versao_material),
      availableAt: text(row?.data_entrega_prevista),
      accessAvailable: access.available,
      accessUrl: access.directUrl,
    }];
  });
}

function parseHistory(value: unknown): LawStudyHistoryItem[] {
  if (!Array.isArray(value)) return [];
  const importanceValues = new Set<LawStudyHistoryItem["importance"]>(["informativa", "recomendada", "essencial"]);

  return value.flatMap((item) => {
    const row = record(item);
    const id = positiveInteger(row?.id);
    const type = text(row?.tipo);
    const importance = text(row?.importancia) as LawStudyHistoryItem["importance"] | null;
    const title = text(row?.titulo);
    const publishedAt = text(row?.data_publicacao) ?? text(row?.created_at);
    if (id === null || !type || !importance || !importanceValues.has(importance) || !title || !publishedAt) return [];
    return [{ id, type, importance, title, summary: text(row?.descricao_resumida), legalReference: text(row?.referencia_normativa), version: text(row?.versao_nova), publishedAt }];
  });
}

export async function authorizeLawStudy(request: Request, slug: string) {
  if (!isValidLawSlug(slug)) throw new LawStudyApiError(400, "Identificador de lei inválido.");
  const url = new URL(request.url);
  if (url.searchParams.has("aluno_id") || url.searchParams.has("lei_id")) throw new LawStudyApiError(400, "Parâmetro não permitido.");

  const token = bearerToken(request);
  if (!token) throw new LawStudyApiError(401, "Entre na sua conta para acessar esta lei.");

  const supabase = getSupabaseServerClient();
  const { data: userData, error: userError } = await supabase.auth.getUser(token);
  if (userError || !userData.user) throw new LawStudyApiError(401, "Sua sessão expirou. Entre novamente.");

  const [{ data: studentData, error: studentError }, { data: lawData, error: lawError }] = await Promise.all([
    supabase.from("alunos").select("id").eq("user_id", userData.user.id).maybeSingle(),
    supabase.from("leis").select("id,slug,titulo,nome_curto,codigo").eq("slug", slug).eq("ativo", true).maybeSingle(),
  ]);
  if (studentError) throw new LawStudyApiError(503, "Não foi possível verificar seu acesso agora.");
  const student = record(studentData);
  const studentId = text(student?.id);
  if (!studentId) throw new LawStudyApiError(404, "Lei não encontrada ou não liberada para sua conta.");
  if (lawError) throw new LawStudyApiError(503, "Não foi possível carregar esta lei agora.");
  const law = record(lawData);
  const lawId = positiveInteger(law?.id);
  const title = text(law?.titulo);
  if (lawId === null || !title) throw new LawStudyApiError(404, "Lei não encontrada ou não liberada para sua conta.");

  const [{ data: passwordStatus, error: passwordStatusError }, { data: accessData, error: accessError }] = await Promise.all([
    supabase.from("alunos").select("deve_trocar_senha").eq("id", studentId).single(),
    supabase.from("liberacoes_leis").select("id").eq("aluno_id", studentId).eq("lei_id", lawId).eq("status", "ativo").limit(1),
  ]);
  if (passwordStatusError) throw new LawStudyApiError(503, "Não foi possível verificar seu acesso agora.");
  if (passwordStatus?.deve_trocar_senha === true) throw new LawStudyApiError(403, "Crie sua nova senha antes de acessar suas leis.");

  if (accessError) throw new LawStudyApiError(503, "Não foi possível verificar seu acesso agora.");
  if (!Array.isArray(accessData) || accessData.length === 0) throw new LawStudyApiError(404, "Lei não encontrada ou não liberada para sua conta.");

  return { supabase, lawId, title, law, studentId };
}

export async function loadLawStudy(request: Request, slug: string): Promise<LawStudyData> {
  const { supabase, lawId, title, law, studentId } = await authorizeLawStudy(request, slug);
  const [materialsResult, historyResult, progressResult, totalFlashcards] = await Promise.all([
    supabase.from("materiais_leis").select("id,tipo,titulo,descricao,provedor,url_externa,acao,quantidade_itens,versao_material,data_entrega_prevista").eq("lei_id", lawId).eq("ativo", true).order("ordem", { ascending: true }).order("id", { ascending: true }),
    supabase.from("historico_atualizacoes_leis").select("id,tipo,importancia,titulo,descricao_resumida,referencia_normativa,versao_nova,data_publicacao,created_at").eq("lei_id", lawId).eq("visivel_aluno", true).order("data_publicacao", { ascending: false, nullsFirst: false }).order("created_at", { ascending: false }),
    supabase.from("progresso_leis_alunos").select("em_estudo,questoes_finalizadas").eq("aluno_id", studentId).eq("lei_id", lawId).maybeSingle(),
    activeQuestionCountBySlug(slug),
  ]);
  if (materialsResult.error || historyResult.error || progressResult.error) throw new LawStudyApiError(503, "Não foi possível carregar os dados de estudo agora.");

  const materials = parseLawStudyMaterials(materialsResult.data);
  return {
    law: {
      id: lawId,
      slug,
      title,
      shortName: lawStudyShortName(title, text(law?.nome_curto)),
      code: text(law?.codigo),
      totalFlashcards,
    },
    materials,
    history: parseHistory(historyResult.data),
    progress: {
      inStudy: record(progressResult.data)?.em_estudo === true,
      questionsFinished: record(progressResult.data)?.questoes_finalizadas === true,
    },
  };
}

export async function loadPublicSampleLawStudy(): Promise<LawStudyData> {
  const supabase = getSupabaseServerClient();
  const { data: lawData, error: lawError } = await supabase.from("leis").select("id,slug,titulo,nome_curto,codigo").eq("slug", PUBLIC_SAMPLE_LAW_SLUG).eq("ativo", true).maybeSingle();
  if (lawError) throw new LawStudyApiError(503, "Não foi possível carregar a amostra agora.");
  const law = record(lawData);
  const lawId = positiveInteger(law?.id);
  const title = text(law?.titulo);
  if (lawId === null || !title) throw new LawStudyApiError(404, "Amostra não encontrada.");
  const [{ data: materialsData, error: materialsError }, totalFlashcards] = await Promise.all([supabase.from("materiais_leis").select("id,tipo,titulo,descricao,provedor,url_externa,acao,quantidade_itens,versao_material,data_entrega_prevista").eq("lei_id", lawId).eq("ativo", true).order("ordem", { ascending: true }).order("id", { ascending: true }), activeQuestionCountBySlug(PUBLIC_SAMPLE_LAW_SLUG)]);
  if (materialsError) throw new LawStudyApiError(503, "Não foi possível carregar os materiais da amostra.");
  const materials = parseLawStudyMaterials(materialsData);
  return { law: { id: lawId, slug: PUBLIC_SAMPLE_LAW_SLUG, title, shortName: lawStudyShortName(title, text(law?.nome_curto)), code: text(law?.codigo), totalFlashcards }, materials, history: [], progress: { inStudy: false, questionsFinished: false } };
}

export type LawProgressInput = { inStudy: boolean; questionsFinished: boolean };

export function parseLawProgressInput(value: unknown): LawProgressInput {
  const row = record(value);
  if (!row || Object.keys(row).sort().join(",") !== "inStudy,questionsFinished" || typeof row.inStudy !== "boolean" || typeof row.questionsFinished !== "boolean") {
    throw new LawStudyApiError(400, "Estado de progresso inválido.");
  }
  if (row.questionsFinished && !row.inStudy) throw new LawStudyApiError(400, "Estado de progresso incoerente.");
  return { inStudy: row.inStudy, questionsFinished: row.questionsFinished };
}

export async function updateLawProgress(request: Request, slug: string, value: unknown): Promise<LawProgressInput> {
  const next = parseLawProgressInput(value);
  const { supabase, lawId, studentId } = await authorizeLawStudy(request, slug);
  if (!next.inStudy && !next.questionsFinished) {
    const { error } = await supabase.from("progresso_leis_alunos").delete().eq("aluno_id", studentId).eq("lei_id", lawId);
    if (error) throw new LawStudyApiError(503, "Não foi possível salvar seu progresso agora.");
    return next;
  }
  const { data, error } = await supabase.from("progresso_leis_alunos").upsert({
    aluno_id: studentId,
    lei_id: lawId,
    em_estudo: next.inStudy,
    questoes_finalizadas: next.questionsFinished,
  }, { onConflict: "aluno_id,lei_id" }).select("em_estudo,questoes_finalizadas").single();
  if (error) throw new LawStudyApiError(503, "Não foi possível salvar seu progresso agora.");
  const saved = record(data);
  return { inStudy: saved?.em_estudo === true, questionsFinished: saved?.questoes_finalizadas === true };
}

export function lawStudyErrorResponse(error: unknown) {
  if (error instanceof LawStudyApiError) {
    return Response.json({ success: false, message: error.publicMessage }, { status: error.status, headers: { "Cache-Control": "private, no-store, max-age=0" } });
  }
  console.error("Falha ao carregar área de estudo da lei", error instanceof Error ? error.message : "erro desconhecido");
  return Response.json({ success: false, message: "Não foi possível concluir a operação." }, { status: 500, headers: { "Cache-Control": "private, no-store, max-age=0" } });
}
