import "server-only";

import { getSupabaseServerClient } from "@/lib/supabase-server";
import { sanitizeLegalHtmlCore } from "./sanitize-legal-html-core";
import {
  resolveContinuousReadingIntegrity,
  resolveLegacyReferenceId,
  type ContinuousQuestion,
  type ContinuousReferenceSummary,
  type ReadingIntegrity,
} from "./continuous-reading-core";
import { continuousLegisBotHref } from "./continuous-reading-core";
import { incidenceFromQuestionCount } from "@/lib/article-mapping-incidence";
import { listManualQuestionReferenceTargets } from "@/lib/question-legislative-reference-links";
import { formatLegalReferenceFromOrder } from "@/lib/article-order-structure";
import { getContinuousReadingBlockTexts, type ContinuousReadingBlockText, type ContinuousReadingBlockTextRepository } from "./continuous-reading-block-texts-core";

const PAGE_SIZE = 500;

type LawRow = { id: number; slug: string; titulo: string; nome_curto: string | null; codigo: string | null };
type QuestionRow = { id: string; slug: string; ordem: string; structure_id: number | null };
type ReferenceRow = { id: string; slug: string; ordem: string; identificacao: string; source_question_id: string | null; preparado_em: string | null };
type StructureRow = { id: number; parent_id: number | null; tipo: string; nome: string; ordem: number };
type MappingRow = { slug: string; ordem: string; artigo_recente: boolean | null };

export type ContinuousReadingPriority = "muito_alta" | "alta" | "media" | "baixa" | "nao_mapeado";

export type ContinuousHierarchyNode = { id: number; type: string; name: string };
export type ContinuousReadingReference = ContinuousReferenceSummary & {
  hierarchy: ContinuousHierarchyNode[];
  priority: ContinuousReadingPriority;
  recent: boolean;
  linkedQuestions: number;
};
export type ContinuousReadingBlock = ContinuousReadingReference & { legislation: string };

export type ContinuousReadingModel = {
  law: LawRow;
  /** Server-only snapshot used by legacy-resolution callers in this request. */
  questions: ContinuousQuestion[];
  references: ContinuousReadingReference[];
  integrity: ReadingIntegrity;
};

function publicPriority(questionCount: number): ContinuousReadingPriority {
  return incidenceFromQuestionCount(questionCount);
}

async function allQuestions(lawId: number) {
  const db = getSupabaseServerClient();
  const rows: QuestionRow[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const result = await db.from("questions").select("id,slug,ordem,structure_id").eq("lei_id", lawId).eq("ativo", true).order("ordem").order("id").range(from, from + PAGE_SIZE - 1);
    if (result.error) throw new Error("Não foi possível verificar todas as questões ativas desta legislação.");
    rows.push(...((result.data ?? []) as QuestionRow[]));
    if ((result.data?.length ?? 0) < PAGE_SIZE) break;
  }
  return rows;
}

async function allReferenceSummaries(lawId: number) {
  const db = getSupabaseServerClient();
  const rows: ReferenceRow[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const result = await db.from("legislative_references").select("id,slug,ordem,identificacao,source_question_id,preparado_em").eq("lei_id", lawId).order("ordem").order("id").range(from, from + PAGE_SIZE - 1);
    if (result.error) throw new Error("A base legislativa canônica está indisponível.");
    rows.push(...((result.data ?? []) as ReferenceRow[]));
    if ((result.data?.length ?? 0) < PAGE_SIZE) break;
  }
  return rows;
}

function hierarchyPath(structureId: number | null, structure: StructureRow[]) {
  if (!structureId) return [] as ContinuousHierarchyNode[];
  const byId = new Map(structure.map((node) => [Number(node.id), node]));
  const path: ContinuousHierarchyNode[] = [];
  const visited = new Set<number>();
  for (let node = byId.get(structureId); node && !visited.has(node.id); node = node.parent_id ? byId.get(node.parent_id) : undefined) {
    visited.add(node.id);
    path.unshift({ id: node.id, type: node.tipo, name: node.nome });
  }
  return path;
}

export async function getContinuousReadingModel(rawSlug: string): Promise<ContinuousReadingModel | null> {
  const slug = rawSlug.trim().toLowerCase();
  if (!/^[a-z0-9_-]{1,50}$/.test(slug)) return null;
  const db = getSupabaseServerClient();
  const lawResult = await db.from("leis").select("id,slug,titulo,nome_curto,codigo").eq("slug", slug).eq("ativo", true).eq("status_publicacao", "ativa").maybeSingle();
  if (lawResult.error) throw new Error("Não foi possível consultar a legislação.");
  if (!lawResult.data) return null;
  const law = lawResult.data as LawRow;
  const [questions, references, structure, mappings] = await Promise.all([
    allQuestions(law.id),
    allReferenceSummaries(law.id),
    db.from("law_structure").select("id,parent_id,tipo,nome,ordem").eq("lei_id", law.id).eq("ativo", true).order("ordem").order("id"),
    db.from("article_context_mappings").select("slug,ordem,artigo_recente").eq("slug", slug),
  ]);
  if (structure.error) throw new Error("Não foi possível consultar a hierarquia da legislação.");
  const questionInput: ContinuousQuestion[] = questions.map((question) => ({ id: question.id, slug: question.slug, ordem: question.ordem, structureId: question.structure_id }));
  const targets = await listManualQuestionReferenceTargets(questionInput.map((question) => question.id));
  const referenceInput: ContinuousReferenceSummary[] = references.map((reference) => ({
    id: reference.id,
    slug: reference.slug,
    ordem: reference.ordem,
    // A grade do Mapa e a leitura usam a mesma identidade das questões:
    // Ordem canônica + nome curto já carregado da lei, sem consulta por cartão.
    identificacao: formatLegalReferenceFromOrder(reference.ordem, law.nome_curto) ?? reference.identificacao,
    sourceQuestionId: reference.source_question_id,
    prepared: Boolean(reference.preparado_em),
  }));
  const integrity: ReadingIntegrity = resolveContinuousReadingIntegrity({ lawSlug: law.slug, questions: questionInput, references: referenceInput, manualTargets: targets });

  const questionById = new Map(questions.map((question) => [question.id, question]));
  const structureByReference = new Map<string, number>();
  for (const reference of references) {
    const sourceQuestion = reference.source_question_id ? questionById.get(reference.source_question_id) : undefined;
    if (sourceQuestion?.structure_id) structureByReference.set(reference.id, sourceQuestion.structure_id);
  }
  for (const resolution of integrity.resolutions) {
    if (!resolution.referenceId || structureByReference.has(resolution.referenceId)) continue;
    const question = questionById.get(resolution.questionId);
    if (question?.structure_id) structureByReference.set(resolution.referenceId, question.structure_id);
  }

  const questionCountByReference = new Map<string, number>();
  for (const resolution of integrity.resolutions) {
    if (!resolution.referenceId) continue;
    questionCountByReference.set(resolution.referenceId, (questionCountByReference.get(resolution.referenceId) ?? 0) + 1);
  }
  const mappingByContext = new Map(
    ((mappings.error ? [] : mappings.data ?? []) as MappingRow[]).map((mapping) => [
      `${mapping.slug.toLowerCase()}\u0000${mapping.ordem}`,
      mapping,
    ]),
  );

  return {
    law,
    questions: questionInput,
    integrity,
    references: referenceInput.map((reference) => {
      const linkedQuestions = questionCountByReference.get(reference.id) ?? 0;
      const mapping = mappingByContext.get(`${reference.slug.toLowerCase()}\u0000${reference.ordem}`);
      return {
        ...reference,
        hierarchy: hierarchyPath(structureByReference.get(reference.id) ?? null, (structure.data ?? []) as StructureRow[]),
        priority: publicPriority(linkedQuestions),
        recent: mapping?.artigo_recente === true,
        linkedQuestions,
      };
    }),
  };
}

export async function getContinuousReadingBlocks(model: ContinuousReadingModel, offset: number, limit: number) {
  if (!model.integrity.readingAvailable) return [] as ContinuousReadingBlock[];
  const prepared = model.references.filter((reference) => reference.prepared);
  const selected = prepared.slice(Math.max(0, offset), Math.max(0, offset) + Math.min(100, Math.max(1, limit)));
  if (!selected.length) return [];
  const result = await getSupabaseServerClient().from("legislative_references").select("id,legislacao").eq("lei_id", model.law.id).in("id", selected.map((reference) => reference.id));
  if (result.error) throw new Error("Não foi possível carregar os blocos legislativos.");
  const legislationById = new Map((result.data ?? []).map((row) => [String(row.id), sanitizeLegalHtmlCore(String(row.legislacao ?? "")).trim()]));
  return selected.flatMap((reference) => {
    const legislation = legislationById.get(reference.id);
    return legislation ? [{ ...reference, legislation }] : [];
  });
}

export { getContinuousReadingBlockTexts, type ContinuousReadingBlockText, type ContinuousReadingBlockTextRepository } from "./continuous-reading-block-texts-core";

export async function getContinuousReadingBlockTextsForLaw(rawSlug: string, rawIds: string[]) {
  const db = getSupabaseServerClient();
  return getContinuousReadingBlockTexts(rawSlug, rawIds, {
    async findActiveLaw(slug) {
      const result = await db.from("leis").select("id").eq("slug", slug).eq("ativo", true).eq("status_publicacao", "ativa").maybeSingle();
      if (result.error) throw new Error("Não foi possível consultar a legislação.");
      return result.data ? { id: Number(result.data.id) } : null;
    },
    async findPreparedBlocks(lawId, referenceIds) {
      const result = await db.from("legislative_references").select("id,legislacao").eq("lei_id", lawId).not("preparado_em", "is", null).in("id", referenceIds);
      if (result.error) throw new Error("Não foi possível carregar os blocos legislativos.");
      return (result.data ?? []).map((row) => ({ id: String(row.id), legislation: String(row.legislacao ?? "") }));
    },
  });
}

export async function resolveContinuousReference(rawSlug: string, rawOrder: string) {
  const model = await getContinuousReadingModel(rawSlug);
  if (!model?.integrity.readingAvailable) return null;
  const referenceId = resolveLegacyReferenceId({
    rawOrder,
    questions: model.questions,
    references: model.references,
    resolutions: model.integrity.resolutions,
  });
  return referenceId ? model.references.find((reference) => reference.id === referenceId) ?? null : null;
}

/** Destinos canônicos para exportadores. Retorna vazio quando a lei não está liberada. */
export async function getContinuousQuestionDestinations(rawSlug: string) {
  const model = await getContinuousReadingModel(rawSlug);
  if (!model?.integrity.readingAvailable) return new Map<string, string>();
  const referenceIds = new Set(model.references.filter((reference) => reference.prepared).map((reference) => reference.id));
  return new Map(model.integrity.resolutions.flatMap((resolution) => resolution.referenceId && referenceIds.has(resolution.referenceId)
    ? [[resolution.questionId, `https://www.legisflashcards.com.br${continuousLegisBotHref(model.law.slug, resolution.referenceId)}`] as const]
    : []));
}
