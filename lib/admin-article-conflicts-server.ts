import "server-only";

import { obterAdministrador } from "@/lib/admin-auth";
import { applyBulkQuestionEdit, deactivateAdminQuestion } from "@/lib/admin-questoes-server";
import { getSupabaseServerClient } from "@/lib/supabase-server";
import { normalizeLegisBotIdentifiers } from "@/lib/legisbot/request-validation";
import { createLegisBotSourceSignature } from "@/lib/legisbot/source";
import { legalHtmlToStructuredText, sanitizeLegalHtmlCore } from "@/lib/legisbot/sanitize-legal-html-core";
import {
  compareLegislationText,
  groupLegisBotSourceConflicts,
  legislationVersionId,
  type LegisBotConflictGroup,
  type LegisBotConflictQuestion,
} from "@/lib/legisbot/source-conflicts";
import { hasIncisoGranularityPending, validateQuestionStructure, type StructuralValidation } from "@/lib/question-structure-consistency";
import { applyArticleContextStandardization } from "@/lib/admin-article-context-standardization";

const PAGE_SIZE = 20;
const STRUCTURAL_BATCH_SIZE = 100;
const QUESTION_FIELDS = "id,lei_id,slug,ordem,titulo,assunto,legislacao,pergunta,resposta,justificativa,ativo,updated_at";

export class AdminArticleConflictError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

export type ArticleConflictFilters = {
  law?: string;
  type?: string;
  page?: number;
};

type StructuralBatchTarget = { slug: string; ordem: string };
type StructuralBatchCandidate = StructuralBatchTarget & { expectedOrder: string; questionIds: string[] };

type CommentSummary = { id: number; status: string; precisa_revisao: boolean; source_signature: string | null };

async function requireAdmin() {
  const user = await obterAdministrador();
  if (!user) throw new AdminArticleConflictError(401, "Autenticação administrativa obrigatória.");
  return user;
}

function safeFilter(value: unknown, max = 120) {
  return typeof value === "string" ? value.trim().slice(0, max).toLocaleLowerCase("pt-BR") : "";
}

async function loadQuestions(activeOnly: boolean, pair?: { slug: string; ordem: string }) {
  const db = getSupabaseServerClient();
  const rows: LegisBotConflictQuestion[] = [];
  for (let from = 0; ; from += 1000) {
    let request = db.from("questions").select(QUESTION_FIELDS).order("id").range(from, from + 999);
    if (activeOnly) request = request.eq("ativo", true);
    if (pair) request = request.eq("slug", pair.slug.toLowerCase()).eq("ordem", pair.ordem);
    const result = await request;
    if (result.error) throw new AdminArticleConflictError(503, "Não foi possível consultar os flashcards.");
    const page = (result.data ?? []) as LegisBotConflictQuestion[];
    rows.push(...page);
    if (page.length < 1000) break;
  }
  return rows;
}

async function lawMap() {
  const result = await getSupabaseServerClient().from("leis").select("id,slug,titulo,codigo");
  if (result.error) throw new AdminArticleConflictError(503, "Não foi possível consultar as leis.");
  return new Map((result.data ?? []).map((law) => [String(law.slug).toUpperCase(), {
    id: Number(law.id), title: String(law.titulo), code: law.codigo ? String(law.codigo) : null,
  }]));
}

async function commentsFor(groups: LegisBotConflictGroup[]) {
  const result = await getSupabaseServerClient()
    .from("legisbot_comentarios")
    .select("*");
  if (result.error) throw new AdminArticleConflictError(503, "Não foi possível consultar os comentários do LegisBot.");
  const wanted = new Set(groups.map((group) => group.key));
  return new Map((result.data ?? []).flatMap((row) => {
    const key = `${String(row.slug).toUpperCase()}\u0000${String(row.ordem)}`;
    return wanted.has(key) ? [[key, {
      id: Number(row.id), status: String(row.status), precisa_revisao: row.precisa_revisao === true,
      source_signature: row.source_signature ? String(row.source_signature) : null,
    } satisfies CommentSummary] as const] : [];
  }));
}

export async function listArticleSourceConflicts(filters: ArticleConflictFilters = {}) {
  await requireAdmin();
  const activeRows = await loadQuestions(true);
  const groups = groupLegisBotSourceConflicts(activeRows);
  const structural = new Map<string, { slug: string; ordem: string; questions: LegisBotConflictQuestion[]; validation: StructuralValidation }>();
  const granularities = new Map<string, { slug: string; ordem: string; questions: LegisBotConflictQuestion[] }>();
  const byContext = new Map<string, LegisBotConflictQuestion[]>();
  for (const question of activeRows) { const key = `${question.slug.trim().toUpperCase()}\u0000${question.ordem.trim()}`; byContext.set(key, [...(byContext.get(key) ?? []), question]); }
  for (const [key, questions] of byContext) { const validation = questions.map((question) => validateQuestionStructure(question)).find((item) => item.status !== "valid"); if (validation) structural.set(key, { slug: questions[0].slug.toUpperCase(), ordem: questions[0].ordem, questions, validation }); if (questions.some((question) => hasIncisoGranularityPending(question))) granularities.set(key, { slug: questions[0].slug.toUpperCase(), ordem: questions[0].ordem, questions }); }
  const legalByKey = new Map(groups.map((group) => [group.key, group]));
  const decisions = await getSupabaseServerClient().from("article_context_mappings").select("slug,ordem,granularidade_legislacao");
  if (decisions.error) throw new AdminArticleConflictError(503, "Não foi possível consultar as decisões editoriais de granularidade.");
  const decidedGranularities = new Set((decisions.data ?? []).flatMap((item) => item.granularidade_legislacao === "paragrafo_inteiro" || item.granularidade_legislacao === "recorte_inciso" ? [`${String(item.slug).toUpperCase()}\u0000${String(item.ordem)}`] : []));
  for (const key of decidedGranularities) granularities.delete(key);
  const contextKeys = [...new Set([...legalByKey.keys(), ...structural.keys(), ...granularities.keys()])];
  const [laws, comments] = await Promise.all([lawMap(), commentsFor(groups)]);
  const law = safeFilter(filters.law);
  const type = safeFilter(filters.type, 40);
  const filtered = contextKeys.filter((key) => {
    const group = legalByKey.get(key); const structuralGroup = structural.get(key); const granularity = granularities.get(key); const slug = group?.slug ?? structuralGroup?.slug ?? granularity!.slug;
    const metadata = laws.get(slug);
    const comment = comments.get(key);
    if (law && slug.toLocaleLowerCase("pt-BR") !== law) return false;
    if (type === "estrutural" && structuralGroup?.validation.status !== "conflict") return false;
    if (type === "possivel_estrutural" && structuralGroup?.validation.status !== "possible_conflict") return false;
    if (type === "legislacao" && !group) return false;
    if (type === "granularidade" && !granularity) return false;
    if (type === "comentario_sem_analise" && (!comment || !["pendente", "processando"].includes(comment.status))) return false;
    return true;
  });
  // Os totais por tipo sempre respeitam a lei selecionada, mas não o tipo
  // atualmente escolhido no filtro. Assim o quadro funciona como um placar
  // de avisos pendentes para a lei.
  const contextsForLaw = contextKeys.filter((key) => {
    const slug = legalByKey.get(key)?.slug ?? structural.get(key)?.slug ?? granularities.get(key)?.slug ?? "";
    return !law || slug.toLocaleLowerCase("pt-BR") === law;
  });
  const typeCounts = {
    structural: contextsForLaw.filter((key) => structural.get(key)?.validation.status === "conflict").length,
    possibleStructural: contextsForLaw.filter((key) => structural.get(key)?.validation.status === "possible_conflict").length,
    legislation: contextsForLaw.filter((key) => legalByKey.has(key)).length,
    granularity: contextsForLaw.filter((key) => granularities.has(key)).length,
    commentWithoutAnalysis: contextsForLaw.filter((key) => {
      const comment = comments.get(key);
      return Boolean(comment && ["pendente", "processando"].includes(comment.status));
    }).length,
  };
  const requestedPage = Number(filters.page);
  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const page = Math.min(pages, Math.max(1, Number.isSafeInteger(requestedPage) ? requestedPage : 1));
  const start = (page - 1) * PAGE_SIZE;
  const items = filtered.slice(start, start + PAGE_SIZE).map((key) => {
    const group = legalByKey.get(key); const structuralGroup = structural.get(key); const granularity = granularities.get(key); const questions = group?.questions ?? structuralGroup?.questions ?? granularity!.questions; const slug = group?.slug ?? structuralGroup?.slug ?? granularity!.slug; const currentOrder = group?.ordem ?? structuralGroup?.ordem ?? granularity!.ordem;
    const metadata = laws.get(slug);
    const comment = comments.get(key);
    return {
      slug,
      ordem: currentOrder,
      lawTitle: metadata?.title ?? questions[0]?.titulo ?? slug,
      lawCode: metadata?.code ?? null,
      titulo: questions.find((item) => item.titulo?.trim())?.titulo ?? null,
      assunto: questions.find((item) => item.assunto?.trim())?.assunto ?? null,
      flashcards: questions.length,
      versions: group?.versions.size ?? 1,
      comment,
      structuralValidation: structuralGroup?.validation ?? null,
      editorialGranularityPending: Boolean(granularity),
    };
  });
  // Os indicadores precisam refletir exatamente o mesmo universo da lista.
  // Antes deste ponto eles usavam `contextKeys`, o conjunto global, e por isso
  // continuavam exibindo pendências de outras leis depois de aplicar o filtro.
  const filteredContexts = filtered.map((key) => ({
    key,
    group: legalByKey.get(key),
    structural: structural.get(key),
    granularity: granularities.get(key),
  }));
  const structuralSuggestions = filtered.flatMap((key) => {
    const item = structural.get(key);
    return item?.validation.status === "conflict" && item.validation.expectedOrder ? [{ slug: item.slug, ordem: item.ordem }] : [];
  }).slice(0, STRUCTURAL_BATCH_SIZE);
  return {
    items,
    structuralSuggestions,
    page,
    pages,
    total: filtered.length,
    indicators: {
      pending: filteredContexts.length,
      laws: new Set(filteredContexts.map((item) => item.group?.slug ?? item.structural?.slug ?? item.granularity!.slug)).size,
      flashcards: filteredContexts.reduce((sum, item) => sum + (item.group?.questions ?? item.structural?.questions ?? item.granularity!.questions).length, 0),
    },
    typeCounts,
  };
}

function structuralBatchTargets(input: unknown): StructuralBatchTarget[] {
  if (!Array.isArray(input) || !input.length || input.length > STRUCTURAL_BATCH_SIZE) throw new AdminArticleConflictError(400, "Selecione de 1 a 100 contextos para a correção em lote.");
  const unique = new Map<string, StructuralBatchTarget>();
  for (const value of input) {
    if (!value || typeof value !== "object") throw new AdminArticleConflictError(400, "Contexto selecionado inválido.");
    const identifiers = normalizeLegisBotIdentifiers(String((value as Record<string, unknown>).slug ?? ""), String((value as Record<string, unknown>).ordem ?? ""));
    unique.set(`${identifiers.slug}\u0000${identifiers.ordem}`, identifiers);
  }
  return [...unique.values()];
}

async function structuralBatchCandidates(targets: StructuralBatchTarget[]) {
  const candidates: StructuralBatchCandidate[] = [];
  const excluded: Array<StructuralBatchTarget & { reason: string }> = [];
  for (const target of targets) {
    const rows = await loadQuestions(true, target);
    if (!rows.length) { excluded.push({ ...target, reason: "Não há questões ativas neste contexto." }); continue; }
    const validations = rows.map((row) => validateQuestionStructure(row));
    const expectedOrders = new Set(validations.filter((item) => item.status === "conflict" && item.expectedOrder).map((item) => item.expectedOrder!));
    if (!validations.every((item) => item.status === "conflict" && item.expectedOrder) || expectedOrders.size !== 1) {
      excluded.push({ ...target, reason: "O contexto não possui uma única ordem sugerida com segurança." }); continue;
    }
    const expectedOrder = [...expectedOrders][0];
    if (expectedOrder === target.ordem) { excluded.push({ ...target, reason: "A ordem sugerida já é a ordem atual." }); continue; }
    candidates.push({ ...target, expectedOrder, questionIds: rows.map((row) => row.id).sort() });
  }
  return { candidates, excluded };
}

export async function previewArticleStructuralBatch(input: unknown) {
  await requireAdmin();
  return structuralBatchCandidates(structuralBatchTargets(input));
}

export async function applyArticleStructuralBatch(input: { contexts: unknown; confirmation: string }) {
  await requireAdmin();
  if (input.confirmation !== "APLICAR ORDENS") throw new AdminArticleConflictError(422, "Digite APLICAR ORDENS para confirmar.");
  const preview = await structuralBatchCandidates(structuralBatchTargets(input.contexts));
  const applied: Array<StructuralBatchCandidate & { questions: number }> = [];
  const failed: Array<StructuralBatchTarget & { reason: string }> = [...preview.excluded];
  for (const candidate of preview.candidates) {
    try {
      const result = await applyArticleContextStandardization({ law_slug: candidate.slug.toLowerCase(), context_slug: candidate.slug.toLowerCase(), context_ordem: candidate.ordem, changes: { ordem: candidate.expectedOrder }, expected_question_ids: candidate.questionIds });
      applied.push({ ...candidate, questions: result.questions });
    } catch (error) {
      failed.push({ slug: candidate.slug, ordem: candidate.ordem, reason: error instanceof Error ? error.message : "Não foi possível corrigir este contexto." });
    }
  }
  return { applied, failed };
}

export async function getArticleSourceConflict(rawSlug: string, rawOrdem: string) {
  await requireAdmin();
  const identifiers = normalizeLegisBotIdentifiers(rawSlug, rawOrdem);
  const all = await loadQuestions(false, identifiers);
  const activeConflict = groupLegisBotSourceConflicts(all);
  const conflict = activeConflict.find((item) => item.slug === identifiers.slug && item.ordem === identifiers.ordem);
  if (!conflict) return null;
  const [laws, comments, allConflicts] = await Promise.all([
    lawMap(), commentsFor([conflict]), loadQuestions(true).then(groupLegisBotSourceConflicts),
  ]);
  const activeVersions = [...conflict.versions.entries()];
  const versions = activeVersions.map(([id, activeQuestions], index) => {
    const representative = activeQuestions[0];
    const questions = all.filter((question) => legislationVersionId(question.legislacao) === id);
    const reference = activeVersions.find((_, otherIndex) => otherIndex !== index)?.[1][0]?.legislacao ?? null;
    return {
      id,
      sanitizedHtml: sanitizeLegalHtmlCore(representative.legislacao ?? ""),
      differences: compareLegislationText(representative.legislacao, reference),
      activeCount: activeQuestions.length,
      questions: questions.map((question) => ({
        ...question,
        editorUrl: `/admin/leis/${encodeURIComponent(question.slug.toLowerCase())}/questoes?question_id=${encodeURIComponent(question.id)}&retorno=${encodeURIComponent(`/admin/artigos/conflitos/${identifiers.slug.toLowerCase()}/${identifiers.ordem}`)}`,
      })),
    };
  });
  const position = allConflicts.findIndex((item) => item.key === conflict.key);
  const next = position >= 0 && allConflicts.length > 1 ? allConflicts[(position + 1) % allConflicts.length] : null;
  const metadata = laws.get(conflict.slug);
  return {
    slug: conflict.slug,
    ordem: conflict.ordem,
    lawId: metadata?.id ?? conflict.questions[0].lei_id,
    lawTitle: metadata?.title ?? conflict.questions[0].titulo ?? conflict.slug,
    lawCode: metadata?.code ?? null,
    flashcards: conflict.questions.length,
    versions,
    comment: comments.get(conflict.key) ?? null,
    next: next ? { slug: next.slug, ordem: next.ordem } : null,
  };
}

export async function previewArticleSourceStandardization(rawSlug: string, rawOrdem: string, versionId: string) {
  await requireAdmin();
  if (!/^[0-9a-f]{64}$/.test(versionId)) throw new AdminArticleConflictError(400, "Versão de legislação inválida.");
  const identifiers = normalizeLegisBotIdentifiers(rawSlug, rawOrdem);
  const rows = (await loadQuestions(true, identifiers)).sort((a, b) => a.id.localeCompare(b.id));
  const selected = rows.find((row) => legislationVersionId(row.legislacao) === versionId);
  if (!selected) throw new AdminArticleConflictError(409, "A versão escolhida não está mais disponível. Recarregue o conflito.");
  const expected = rows.map((row) => ({ id: row.id, before: row.legislacao }));
  const affectedIds = rows.filter((row) => row.legislacao !== selected.legislacao).map((row) => row.id);
  return {
    slug: identifiers.slug,
    ordem: identifiers.ordem,
    versionId,
    value: selected.legislacao ?? "",
    questionIds: rows.map((row) => row.id),
    affectedIds,
    expected,
    count: affectedIds.length,
  };
}

export async function applyArticleSourceStandardization(input: { slug: string; ordem: string; versionId: string; expected: unknown; confirmation: string }) {
  if (input.confirmation !== "PADRONIZAR") throw new AdminArticleConflictError(422, "Digite PADRONIZAR para confirmar.");
  const preview = await previewArticleSourceStandardization(input.slug, input.ordem, input.versionId);
  if (!Array.isArray(input.expected) || JSON.stringify(input.expected) !== JSON.stringify(preview.expected)) {
    throw new AdminArticleConflictError(409, "Os flashcards mudaram desde a confirmação. Gere uma nova prévia.");
  }
  const result = await applyBulkQuestionEdit({
    law_slug: preview.slug.toLowerCase(), scope: "selected", field: "legislacao", value: preview.value,
    question_ids: preview.questionIds, expected: preview.expected,
  });
  const selected = (await loadQuestions(true, { slug: preview.slug, ordem: preview.ordem })).find((row) => legislationVersionId(row.legislacao) === preview.versionId);
  if (selected) await markCommentForReviewWhenNeeded(selected);
  return { result, resolved: (await getArticleSourceConflict(preview.slug, preview.ordem)) === null };
}

async function markCommentForReviewWhenNeeded(source: LegisBotConflictQuestion) {
  const db = getSupabaseServerClient();
  const current = await db.from("legisbot_comentarios").select("id,titulo,assunto,legislacao,source_signature,precisa_revisao").eq("slug", source.slug.toUpperCase()).eq("ordem", source.ordem).maybeSingle();
  if (current.error || !current.data) return;
  const nextSignature = createLegisBotSourceSignature({
    titulo: source.titulo?.trim() ?? "", assunto: source.assunto?.trim() ?? "",
    promptLegislacao: legalHtmlToStructuredText(source.legislacao ?? ""),
  });
  const storedSignature = current.data.source_signature ? String(current.data.source_signature) : createLegisBotSourceSignature({
    titulo: String(current.data.titulo ?? ""), assunto: String(current.data.assunto ?? ""),
    promptLegislacao: legalHtmlToStructuredText(String(current.data.legislacao ?? "")),
  });
  if (storedSignature === nextSignature || current.data.precisa_revisao === true) return;
  const updated = await db.from("legisbot_comentarios").update({ precisa_revisao: true }).eq("id", current.data.id);
  if (updated.error) throw new AdminArticleConflictError(503, "Os flashcards foram corrigidos, mas não foi possível sinalizar a revisão do comentário.");
}

export async function deactivateArticleConflictQuestion(rawSlug: string, rawOrdem: string, questionId: string, confirmation: string) {
  await requireAdmin();
  if (confirmation !== "INATIVAR") throw new AdminArticleConflictError(422, "Digite INATIVAR para confirmar.");
  const identifiers = normalizeLegisBotIdentifiers(rawSlug, rawOrdem);
  const rows = await loadQuestions(true, identifiers);
  const selected = rows.find((row) => row.id === questionId);
  if (!selected) throw new AdminArticleConflictError(404, "Flashcard ativo não encontrado neste conflito.");
  await deactivateAdminQuestion({ law_slug: identifiers.slug.toLowerCase(), id: selected.id });
  const remaining = await loadQuestions(true, identifiers);
  if (remaining.length && new Set(remaining.map((row) => legislationVersionId(row.legislacao))).size === 1) await markCommentForReviewWhenNeeded(remaining[0]);
  return { id: selected.id, resolved: (await getArticleSourceConflict(identifiers.slug, identifiers.ordem)) === null };
}
