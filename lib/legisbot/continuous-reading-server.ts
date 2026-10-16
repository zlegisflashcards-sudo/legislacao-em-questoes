import "server-only";

import { getSupabaseServerClient } from "@/lib/supabase-server";
import { sanitizeLegalHtmlCore } from "./sanitize-legal-html-core";
import {
  resolveContinuousReadingIntegrity,
  type ContinuousQuestion,
  type ContinuousReferenceSummary,
  type ManualCommentTarget,
  type ReadingIntegrity,
} from "./continuous-reading-core";
import { legisBotOrderCandidates } from "./order-candidates";
import { continuousLegisBotHref } from "./continuous-reading-core";

const PAGE_SIZE = 500;

type LawRow = { id: number; slug: string; titulo: string; nome_curto: string | null; codigo: string | null };
type QuestionRow = { id: string; slug: string; ordem: string; structure_id: number | null };
type ReferenceRow = { id: string; slug: string; ordem: string; identificacao: string; source_question_id: string | null; preparado_em: string | null };
type StructureRow = { id: number; parent_id: number | null; tipo: string; nome: string; ordem: number };
type LinkRow = { question_id: string; legisbot_id: number };
type CommentTargetRow = { id: number; slug: string; ordem: string };

export type ContinuousHierarchyNode = { id: number; type: string; name: string };
export type ContinuousReadingReference = ContinuousReferenceSummary & { hierarchy: ContinuousHierarchyNode[] };
export type ContinuousReadingBlock = ContinuousReadingReference & { legislation: string };

export type ContinuousReadingModel = {
  law: LawRow;
  references: ContinuousReadingReference[];
  integrity: ReadingIntegrity;
};

function chunks<T>(items: T[], size = 200) {
  const result: T[][] = [];
  for (let index = 0; index < items.length; index += size) result.push(items.slice(index, index + size));
  return result;
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

async function manualTargets(questionIds: string[]) {
  if (!questionIds.length) return [] as ManualCommentTarget[];
  const db = getSupabaseServerClient();
  const links: LinkRow[] = [];
  for (const ids of chunks(questionIds)) {
    const result = await db.from("question_legisbot_links").select("question_id,legisbot_id").in("question_id", ids);
    if (result.error) throw new Error("Não foi possível verificar os vínculos editoriais manuais.");
    links.push(...((result.data ?? []) as LinkRow[]));
  }
  const commentIds = [...new Set(links.map((link) => Number(link.legisbot_id)).filter(Number.isSafeInteger))];
  const comments: CommentTargetRow[] = [];
  for (const ids of chunks(commentIds)) {
    const result = await db.from("legisbot_comentarios").select("id,slug,ordem").in("id", ids);
    if (result.error) throw new Error("Não foi possível verificar os destinos manuais do LegisBot.");
    comments.push(...((result.data ?? []) as CommentTargetRow[]));
  }
  const byId = new Map(comments.map((comment) => [Number(comment.id), comment]));
  return links.map((link) => {
    const target = byId.get(Number(link.legisbot_id));
    return { questionId: link.question_id, commentId: Number(link.legisbot_id), slug: target?.slug ?? null, ordem: target?.ordem ?? null };
  });
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
  const [questions, references, structure] = await Promise.all([
    allQuestions(law.id),
    allReferenceSummaries(law.id),
    db.from("law_structure").select("id,parent_id,tipo,nome,ordem").eq("lei_id", law.id).eq("ativo", true).order("ordem").order("id"),
  ]);
  if (structure.error) throw new Error("Não foi possível consultar a hierarquia da legislação.");
  const targets = await manualTargets(questions.map((question) => question.id));
  const questionInput: ContinuousQuestion[] = questions.map((question) => ({ id: question.id, slug: question.slug, ordem: question.ordem, structureId: question.structure_id }));
  const referenceInput: ContinuousReferenceSummary[] = references.map((reference) => ({ id: reference.id, slug: reference.slug, ordem: reference.ordem, identificacao: reference.identificacao, sourceQuestionId: reference.source_question_id, prepared: Boolean(reference.preparado_em) }));
  const integrity = resolveContinuousReadingIntegrity({ lawSlug: law.slug, questions: questionInput, references: referenceInput, manualTargets: targets });

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

  return {
    law,
    integrity,
    references: referenceInput.map((reference) => ({ ...reference, hierarchy: hierarchyPath(structureByReference.get(reference.id) ?? null, (structure.data ?? []) as StructureRow[]) })),
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

export async function resolveContinuousReference(rawSlug: string, rawOrder: string) {
  const model = await getContinuousReadingModel(rawSlug);
  if (!model?.integrity.readingAvailable) return null;
  const orders = legisBotOrderCandidates(rawOrder.trim());
  for (const order of orders) {
    const exact = model.references.find((reference) => reference.ordem === order && reference.prepared);
    if (exact) return exact;
  }
  const questionResolutions = model.integrity.resolutions.filter((resolution) => resolution.ordem && resolution.referenceId);
  const matchingQuestion = (await allQuestions(model.law.id)).find((question) => orders.includes(question.ordem));
  if (!matchingQuestion) return null;
  const resolution = questionResolutions.find((item) => item.questionId === matchingQuestion.id);
  return resolution?.referenceId ? model.references.find((reference) => reference.id === resolution.referenceId) ?? null : null;
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
