import "server-only";

import { exigirAdministrador } from "@/lib/admin-auth";
import { getSupabaseServerClient } from "@/lib/supabase-server";

export const INCIDENCIAS = ["muito_alta", "alta", "media", "baixa", "nao_mapeado"] as const;
export const ORIGENS_MAPEAMENTO = ["questoes_reais", "estimativa", "analogia", "manual", "ia"] as const;
export const IMPORT_CONFIRMATION = "APLICAR MAPEAMENTO";

export type MappingInput = {
  slug: string;
  ordem: string;
  incidencia?: string;
  artigo_recente?: boolean;
  origem_mapeamento?: string | null;
  observacao_interna?: string | null;
  confianca?: number | null;
};


type QuestionRow = { slug: string; ordem: string; assunto: string | null; legislacao: string | null; legisbot_id?: number | null };
type LegisBotMappingContext = { id: number; slug: string; ordem: string; assunto: string | null; legislacao: string | null };
type StoredMapping = {
  slug: string;
  ordem: string;
  incidencia: string;
  artigo_recente: boolean;
  origem_mapeamento: string | null;
  observacao_interna: string | null;
  confianca: number | null;
};
const mappingKey = (slug: string, ordem: string) => `${slug.toLowerCase()}\0${ordem}`;
const includes = (values: readonly string[], value: string | undefined) => Boolean(value && values.includes(value));

export function normalizeMappingInput(input: MappingInput) {
  const confidence = input.confianca == null ? null : Number(input.confianca);
  if (confidence !== null && (!Number.isFinite(confidence) || confidence < 0 || confidence > 1)) throw new Error("A confiança deve estar entre 0 e 1.");
  return {
    slug: input.slug.trim().toLowerCase(),
    ordem: input.ordem.trim(),
    incidencia: includes(INCIDENCIAS, input.incidencia) ? input.incidencia! : "nao_mapeado",
    artigo_recente: input.artigo_recente === true,
    origem_mapeamento: includes(ORIGENS_MAPEAMENTO, input.origem_mapeamento ?? undefined) ? input.origem_mapeamento! : null,
    observacao_interna: input.observacao_interna?.trim() || null,
    confianca: confidence,
  };
}

export async function saveArticleMapping(input: MappingInput) {
  await exigirAdministrador();
  const db = getSupabaseServerClient();
  const row = normalizeMappingInput(input);
  if (!row.slug || !row.ordem) throw new Error("Slug e ordem são obrigatórios.");
  const [question, legisBot] = await Promise.all([
    db.from("questions").select("id").eq("ativo", true).eq("slug", row.slug).eq("ordem", row.ordem).limit(1),
    db.from("legisbot_comentarios").select("id").eq("slug", row.slug.toUpperCase()).eq("ordem", row.ordem).eq("context_kind", "shadow_question").limit(1),
  ]);
  if (question.error) throw new Error(question.error.message);
  if (legisBot.error) throw new Error(legisBot.error.message);
  if (!question.data?.length && !legisBot.data?.length) throw new Error("Contexto não encontrado nas questões nem no LegisBot; nenhum mapeamento foi salvo.");
  const result = await db.from("article_context_mappings").upsert({ ...row, updated_at: new Date().toISOString() }, { onConflict: "slug,ordem" }).select().single();
  if (result.error) throw new Error(result.error.message);
  return result.data;
}

export async function articleMappings(slug = "") {
  await exigirAdministrador();
  const db = getSupabaseServerClient();
  let request = db.from("article_context_mappings").select("*");
  if (slug) request = request.eq("slug", slug.toLowerCase());
  const result = await request;
  if (result.error) throw new Error(result.error.message);
  return (result.data ?? []) as StoredMapping[];
}

export async function exportArticleMappings(slug = "") {
  await exigirAdministrador();
  const db = getSupabaseServerClient();
  let request = db.from("questions").select("slug,ordem,assunto,legislacao").eq("ativo", true);
  if (slug) request = request.eq("slug", slug.toLowerCase());
  let legisBotRequest = db.from("legisbot_comentarios").select("id,slug,ordem,assunto,legislacao").eq("context_kind", "shadow_question");
  if (slug) legisBotRequest = legisBotRequest.eq("slug", slug.toUpperCase());
  const [result, legisBotResult] = await Promise.all([request, legisBotRequest]);
  if (result.error) throw new Error(result.error.message);
  if (legisBotResult.error) throw new Error(legisBotResult.error.message);
  const groups = new Map<string, QuestionRow[]>();
  for (const item of (result.data ?? []) as QuestionRow[]) {
    const key = mappingKey(item.slug, item.ordem);
    groups.set(key, [...(groups.get(key) ?? []), item]);
  }
  for (const item of (legisBotResult.data ?? []) as LegisBotMappingContext[]) {
    const key = mappingKey(item.slug, item.ordem);
    if (!groups.has(key)) groups.set(key, [{ slug: item.slug.toLowerCase(), ordem: item.ordem, assunto: item.assunto, legislacao: item.legislacao, legisbot_id: item.id }]);
  }
  const mappings = await articleMappings(slug);
  const mappingByContext = new Map<string, StoredMapping>(mappings.map((item: StoredMapping) => [mappingKey(item.slug, item.ordem), item]));
  return [...groups.values()].map((questions) => {
    const first = questions[0];
    const mapping = mappingByContext.get(mappingKey(first.slug, first.ordem));
    const assuntos = new Set(questions.map((item) => item.assunto ?? ""));
    const legislacoes = new Set(questions.map((item) => item.legislacao ?? ""));
    return {
      slug: first.slug,
      ordem: first.ordem,
      assunto: first.assunto ?? "",
      referencia_amigavel: first.assunto ?? "",
      legislacao_consolidada: first.legislacao ?? "",
      quantidade_questoes: questions.length,
      legisbot_id: first.legisbot_id ?? null,
      origem_contexto: first.legisbot_id ? "legisbot" : "questoes",
      conflito: assuntos.size > 1 || legislacoes.size > 1,
      incidencia: mapping?.incidencia ?? "nao_mapeado",
      artigo_recente: mapping?.artigo_recente ?? false,
      origem_mapeamento: mapping?.origem_mapeamento ?? "",
      observacao_interna: mapping?.observacao_interna ?? "",
      confianca: mapping?.confianca ?? "",
    };
  }).sort((left, right) => left.slug.localeCompare(right.slug) || left.ordem.localeCompare(right.ordem));
}

export async function previewMappingImport(rows: MappingInput[]) {
  const existing = await exportArticleMappings();
  const current = new Map(existing.map((item) => [mappingKey(item.slug, item.ordem), item]));
  const items = rows.map((raw) => {
    const row = normalizeMappingInput(raw);
    const found = current.get(mappingKey(row.slug, row.ordem));
    if (!found) return { ...row, status: "inexistente" as const };
    const changed = (["incidencia", "artigo_recente", "origem_mapeamento", "observacao_interna", "confianca"] as const).some((field) => String(found[field] ?? "") !== String(row[field] ?? ""));
    return { ...row, status: changed ? "atualizar" as const : "igual" as const };
  });
  return { items, resumo: { encontrados: items.filter((item) => item.status !== "inexistente").length, atualizar: items.filter((item) => item.status === "atualizar").length, iguais: items.filter((item) => item.status === "igual").length, inexistentes: items.filter((item) => item.status === "inexistente").length } };
}

export async function applyMappingImport(rows: MappingInput[], confirmation: string) {
  if (confirmation !== IMPORT_CONFIRMATION) throw new Error(`Digite “${IMPORT_CONFIRMATION}” para confirmar a importação.`);
  const preview = await previewMappingImport(rows);
  for (const row of preview.items.filter((item) => item.status === "atualizar")) await saveArticleMapping(row);
  return preview.resumo;
}
