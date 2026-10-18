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
import { canonicalizeQuestionLawReference, hasIncisoGranularityPending, validateQuestionStructure, type StructuralValidation } from "@/lib/question-structure-consistency";
import { applyArticleContextStandardization } from "@/lib/admin-article-context-standardization";
import { normalizeQuestionLegalReference } from "@/lib/question-legal-reference";
import { groupDuplicateQuestionStatements } from "@/lib/admin-question-management";

const PAGE_SIZE = 20;
const STRUCTURAL_BATCH_SIZE = 100;
const QUESTION_FIELDS = "id,lei_id,slug,ordem,titulo,assunto,legislacao,pergunta,resposta,justificativa,ativo,updated_at";

export class AdminArticleConflictError extends Error {
  constructor(
    public status: number,
    message: string,
    public readonly code = "conflict_operation_failed",
    public readonly details: Record<string, string | null> = {},
  ) { super(message); }
}

export type ArticleConflictFilters = {
  law?: string;
  type?: string;
  page?: number;
  orderDirection?: "asc" | "desc";
};

type StructuralBatchTarget = { slug: string; ordem: string };
type StructuralBatchCandidate = StructuralBatchTarget & { expectedOrder: string; questionIds: string[] };
type GranularityDecision = "paragrafo_inteiro" | "recorte_inciso";
type GranularityBatchCandidate = StructuralBatchTarget & { questionIds: string[] };
type ReferenceCleanupCandidate = { id: string; slug: string; ordem: string; before: string; after: string };
type ShortNameStandardizationCandidate = ReferenceCleanupCandidate;
type ConflictOperationAction = "limpar_html_assunto" | "padronizar_nome_curto" | "manter_granularidade" | "aplicar_estrutura";

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

async function loadQuestionsForLaw(activeOnly: boolean, law: string) {
  const db = getSupabaseServerClient();
  const rows: LegisBotConflictQuestion[] = [];
  for (let from = 0; ; from += 1000) {
    let request = db.from("questions").select(QUESTION_FIELDS).eq("slug", law.toLowerCase()).order("id").range(from, from + 999);
    if (activeOnly) request = request.eq("ativo", true);
    const result = await request;
    if (result.error) throw new AdminArticleConflictError(503, "Não foi possível consultar os flashcards desta lei.", "questions_query_failed", { law });
    const page = (result.data ?? []) as LegisBotConflictQuestion[];
    rows.push(...page);
    if (page.length < 1000) break;
  }
  return rows;
}

async function lawMap() {
  const result = await getSupabaseServerClient().from("leis").select("id,slug,titulo,codigo,nome_curto");
  if (result.error) throw new AdminArticleConflictError(503, "Não foi possível consultar as leis.");
  return new Map((result.data ?? []).map((law) => [String(law.slug).toUpperCase(), {
    id: Number(law.id), title: String(law.titulo), code: law.codigo ? String(law.codigo) : null, shortName: law.nome_curto ? String(law.nome_curto) : null,
  }]));
}

async function persistConflictOperation(input: {
  userId: string;
  lawSlug: string;
  action: ConflictOperationAction;
  filters: Record<string, unknown>;
  items: Array<{ id: string; slug: string; ordem: string; pendingTypes: string[]; before: Record<string, unknown>; after: Record<string, unknown> }>;
}) {
  const laws = await lawMap();
  const law = laws.get(input.lawSlug.toUpperCase());
  if (!law) throw new AdminArticleConflictError(404, "A lei escolhida não foi encontrada.", "law_not_found", { law: input.lawSlug });
  const db = getSupabaseServerClient();
  const created = await db.from("question_conflict_operations").insert({
    lei_id: law.id,
    lei_slug: input.lawSlug.toLowerCase(),
    action: input.action,
    filters: input.filters,
    created_by: input.userId,
    summary: { questions: input.items.length, pending: input.items.reduce((total, item) => total + item.pendingTypes.length, 0) },
  }).select("id").single();
  if (created.error || !created.data) throw new AdminArticleConflictError(503, "Não foi possível registrar a prévia do lote.", "operation_preview_not_saved");
  if (!input.items.length) return String(created.data.id);
  const inserted = await db.from("question_conflict_operation_items").insert(input.items.map((item) => ({
    operation_id: created.data.id,
    question_id: item.id,
    slug: item.slug.toLowerCase(),
    ordem: item.ordem,
    pending_types: item.pendingTypes,
    before_value: item.before,
    after_value: item.after,
  })));
  if (!inserted.error) return String(created.data.id);
  await db.from("question_conflict_operations").update({ status: "failed", summary: { reason: "operation_items_not_saved" } }).eq("id", created.data.id);
  throw new AdminArticleConflictError(503, "Não foi possível congelar as questões da prévia.", "operation_items_not_saved", { operationId: String(created.data.id) });
}

async function startConflictOperation(operationId: unknown, action: ConflictOperationAction, law: string) {
  if (typeof operationId !== "string" || !/^[0-9a-f-]{36}$/i.test(operationId)) {
    throw new AdminArticleConflictError(409, "A prévia deste lote não é válida. Atualize a comparação antes de continuar.", "operation_preview_required");
  }
  const db = getSupabaseServerClient();
  const operation = await db.from("question_conflict_operations").select("id,action,lei_slug,status").eq("id", operationId).maybeSingle();
  if (operation.error || !operation.data || operation.data.action !== action || String(operation.data.lei_slug).toLowerCase() !== law.toLowerCase() || operation.data.status !== "prepared") {
    throw new AdminArticleConflictError(409, "A prévia deste lote foi alterada ou já utilizada. Gere uma nova prévia.", "operation_preview_stale", { operationId });
  }
  const started = await db.from("question_conflict_operations").update({ status: "running", started_at: new Date().toISOString() }).eq("id", operationId).eq("status", "prepared");
  if (started.error) throw new AdminArticleConflictError(503, "Não foi possível iniciar o lote preparado.", "operation_start_failed", { operationId });
  return operationId;
}

async function finishConflictOperation(input: { operationId: string; action: ConflictOperationAction; applied: string[]; noChange: string[]; failed: Array<{ id: string; reason: string }>; }) {
  const db = getSupabaseServerClient();
  const updateItems = async (ids: string[], status: "applied" | "no_change" | "failed", reason?: string) => {
    if (!ids.length) return;
    const result = await db.from("question_conflict_operation_items").update({ status, reason: reason ?? null, reason_code: reason ? "write_failed" : null, applied_at: status === "applied" ? new Date().toISOString() : null }).eq("operation_id", input.operationId).in("question_id", ids);
    if (result.error) console.error("Falha ao registrar resultado do lote", { operationId: input.operationId, status, code: result.error.code });
  };
  await updateItems(input.applied, "applied");
  await updateItems(input.noChange, "no_change");
  for (const failure of input.failed) await updateItems([failure.id], "failed", failure.reason);
  const status = input.failed.length ? (input.applied.length || input.noChange.length ? "partial" : "failed") : "completed";
  const summary = { action: input.action, applied: input.applied.length, noChange: input.noChange.length, failed: input.failed.length };
  const completed = await db.from("question_conflict_operations").update({ status, summary, completed_at: new Date().toISOString() }).eq("id", input.operationId);
  if (completed.error) console.error("Falha ao concluir operação de conflitos", { operationId: input.operationId, code: completed.error.code });
  return { status, summary };
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
  const duplicateStatements = groupDuplicateQuestionStatements(activeRows);
  const structural = new Map<string, { slug: string; ordem: string; questions: LegisBotConflictQuestion[]; validation: StructuralValidation }>();
  const granularities = new Map<string, { slug: string; ordem: string; questions: LegisBotConflictQuestion[] }>();
  const byContext = new Map<string, LegisBotConflictQuestion[]>();
  for (const question of activeRows) { const key = `${question.slug.trim().toUpperCase()}\u0000${question.ordem.trim()}`; byContext.set(key, [...(byContext.get(key) ?? []), question]); }
  const lawsForValidation = await lawMap();
  for (const [key, questions] of byContext) { const lawShortName = lawsForValidation.get(questions[0].slug.toUpperCase())?.shortName; const validation = questions.map((question) => validateQuestionStructure({ ...question, lawShortName })).find((item) => item.status !== "valid"); if (validation) structural.set(key, { slug: questions[0].slug.toUpperCase(), ordem: questions[0].ordem, questions, validation }); if (questions.some((question) => hasIncisoGranularityPending(question))) granularities.set(key, { slug: questions[0].slug.toUpperCase(), ordem: questions[0].ordem, questions }); }
  const legalByKey = new Map(groups.map((group) => [group.key, group]));
  const decisions = await getSupabaseServerClient().from("article_context_mappings").select("slug,ordem,granularidade_legislacao");
  if (decisions.error) throw new AdminArticleConflictError(503, "Não foi possível consultar as decisões editoriais de granularidade.");
  const decidedGranularities = new Set((decisions.data ?? []).flatMap((item) => item.granularidade_legislacao === "paragrafo_inteiro" || item.granularidade_legislacao === "recorte_inciso" ? [`${String(item.slug).toUpperCase()}\u0000${String(item.ordem)}`] : []));
  for (const key of decidedGranularities) granularities.delete(key);
  const contextKeys = [...new Set([...legalByKey.keys(), ...structural.keys(), ...granularities.keys()])];
  const laws = lawsForValidation;
  const law = safeFilter(filters.law);
  const selectedTypes = new Set(safeFilter(filters.type, 160).split(",").filter((value) => ["estrutural", "possivel_estrutural", "legislacao", "granularidade", "pergunta_duplicada"].includes(value)));
  const hasTypeFilter = selectedTypes.size > 0;
  const filtered = contextKeys.filter((key) => {
    const group = legalByKey.get(key); const structuralGroup = structural.get(key); const granularity = granularities.get(key); const slug = group?.slug ?? structuralGroup?.slug ?? granularity!.slug;
    if (law && slug.toLocaleLowerCase("pt-BR") !== law) return false;
    if (hasTypeFilter && !(
      (selectedTypes.has("estrutural") && structuralGroup?.validation.status === "conflict")
      || (selectedTypes.has("possivel_estrutural") && structuralGroup?.validation.status === "possible_conflict")
      || (selectedTypes.has("legislacao") && Boolean(group))
      || (selectedTypes.has("granularidade") && Boolean(granularity))
    )) return false;
    return true;
  });
  const filteredDuplicates = duplicateStatements.filter((group) => {
    const slug = group.questions[0]?.slug ?? "";
    return (!law || slug.toLocaleLowerCase("pt-BR") === law) && (!hasTypeFilter || selectedTypes.has("pergunta_duplicada"));
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
    duplicateStatements: duplicateStatements.filter((group) => !law || group.questions[0]?.slug.toLocaleLowerCase("pt-BR") === law).length,
  };
  const entries = [
    ...filtered.map((key) => ({ kind: "context" as const, key })),
    ...filteredDuplicates.map((group) => ({ kind: "duplicate" as const, group })),
  ].sort((left, right) => {
    const identifiers = (entry: typeof left) => entry.kind === "context"
      ? (() => { const item = legalByKey.get(entry.key) ?? structural.get(entry.key) ?? granularities.get(entry.key)!; return { slug: item.slug, ordem: item.ordem }; })()
      : { slug: entry.group.questions[0]?.slug ?? "", ordem: entry.group.questions[0]?.ordem ?? "" };
    const first = identifiers(left); const second = identifiers(right);
    const compared = first.slug.localeCompare(second.slug) || first.ordem.localeCompare(second.ordem);
    return filters.orderDirection === "desc" ? -compared : compared;
  });
  const requestedPage = Number(filters.page);
  const pages = Math.max(1, Math.ceil(entries.length / PAGE_SIZE));
  const page = Math.min(pages, Math.max(1, Number.isSafeInteger(requestedPage) ? requestedPage : 1));
  const start = (page - 1) * PAGE_SIZE;
  const items = entries.slice(start, start + PAGE_SIZE).map((entry) => {
    if (entry.kind === "duplicate") {
      const questions = entry.group.questions;
      const first = questions[0];
      const metadata = laws.get(first.slug.toUpperCase());
      return {
        slug: first.slug.toUpperCase(),
        ordem: first.ordem,
        lawTitle: metadata?.title ?? first.titulo ?? first.slug,
        lawCode: metadata?.code ?? null,
        titulo: first.titulo ?? null,
        assunto: null,
        flashcards: questions.length,
        versions: 1,
        comment: null,
        structuralValidation: null,
        editorialGranularityPending: false,
        reviewTypes: ["Pergunta duplicada"],
        duplicateQuestions: questions.map((question) => ({
          id: question.id,
          slug: question.slug.toUpperCase(),
          ordem: question.ordem,
          assunto: question.assunto ?? null,
          pergunta: question.pergunta,
          editorUrl: `/admin/leis/${encodeURIComponent(question.slug.toLowerCase())}/questoes?question_id=${encodeURIComponent(question.id)}&retorno=${encodeURIComponent(`/admin/artigos?aba=conflitos&lei=${question.slug.toLowerCase()}&tipo=pergunta_duplicada`)}`,
        })),
      };
    }
    const key = entry.key;
    const group = legalByKey.get(key); const structuralGroup = structural.get(key); const granularity = granularities.get(key); const questions = group?.questions ?? structuralGroup?.questions ?? granularity!.questions; const slug = group?.slug ?? structuralGroup?.slug ?? granularity!.slug; const currentOrder = group?.ordem ?? structuralGroup?.ordem ?? granularity!.ordem;
    const metadata = laws.get(slug);
    const reviewTypes = [
      structuralGroup?.validation.status === "conflict" ? "Conflito estrutural" : structuralGroup?.validation.status === "possible_conflict" ? "Possível conflito estrutural" : null,
      group ? "Legislação divergente" : null,
      granularity ? "Pendência de granularidade" : null,
    ].filter((value): value is string => Boolean(value));
    return {
      slug,
      ordem: currentOrder,
      lawTitle: metadata?.title ?? questions[0]?.titulo ?? slug,
      lawCode: metadata?.code ?? null,
      titulo: questions.find((item) => item.titulo?.trim())?.titulo ?? null,
      assunto: questions.find((item) => item.assunto?.trim())?.assunto ?? null,
      flashcards: questions.length,
      versions: group?.versions.size ?? 1,
      comment: null,
      structuralValidation: structuralGroup?.validation ?? null,
      editorialGranularityPending: Boolean(granularity),
      reviewTypes,
      duplicateQuestions: [],
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
    total: entries.length,
    indicators: {
      pending: filteredContexts.length + filteredDuplicates.length,
      laws: new Set([...filteredContexts.map((item) => item.group?.slug ?? item.structural?.slug ?? item.granularity!.slug), ...filteredDuplicates.map((group) => group.questions[0]?.slug ?? "")]).size,
      flashcards: filteredContexts.reduce((sum, item) => sum + (item.group?.questions ?? item.structural?.questions ?? item.granularity!.questions).length, 0) + filteredDuplicates.reduce((sum, group) => sum + group.questions.length, 0),
    },
    typeCounts,
  };
}

function structuralBatchTargets(input: unknown): StructuralBatchTarget[] {
  if (!Array.isArray(input) || !input.length || input.length > STRUCTURAL_BATCH_SIZE) throw new AdminArticleConflictError(400, "Selecione de 1 a 100 contextos para a correção em lote.");
  const unique = new Map<string, StructuralBatchTarget>();
  for (const value of input) {
    if (!value || typeof value !== "object") throw new AdminArticleConflictError(400, "Contexto selecionado inválido.");
    let identifiers: StructuralBatchTarget;
    try {
      identifiers = normalizeLegisBotIdentifiers(String((value as Record<string, unknown>).slug ?? ""), String((value as Record<string, unknown>).ordem ?? ""));
    } catch {
      throw new AdminArticleConflictError(400, "Um dos contextos selecionados possui Slug ou Ordem inválidos.", "invalid_context_identifiers");
    }
    unique.set(`${identifiers.slug}\u0000${identifiers.ordem}`, identifiers);
  }
  return [...unique.values()];
}

async function structuralBatchCandidates(targets: StructuralBatchTarget[]) {
  const candidates: StructuralBatchCandidate[] = [];
  const excluded: Array<StructuralBatchTarget & { reason: string }> = [];
  for (const target of targets) {
    let rows: LegisBotConflictQuestion[];
    try { rows = await loadQuestions(true, target); }
    catch (error) {
      if (error instanceof AdminArticleConflictError) throw error;
      excluded.push({ ...target, reason: "Não foi possível carregar as questões deste contexto." });
      continue;
    }
    if (!rows.length) { excluded.push({ ...target, reason: "Não há questões ativas neste contexto." }); continue; }
    let validations: StructuralValidation[];
    try { validations = rows.map((row) => validateQuestionStructure(row)); }
    catch {
      excluded.push({ ...target, reason: "A estrutura deste contexto não pôde ser interpretada com segurança. Revise a Ordem individualmente." });
      continue;
    }
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

function granularityDecision(value: unknown): GranularityDecision {
  if (value === "paragrafo_inteiro" || value === "recorte_inciso") return value;
  throw new AdminArticleConflictError(400, "Escolha a decisão editorial de granularidade.");
}

async function granularityBatchCandidates(targets: StructuralBatchTarget[]) {
  const db = getSupabaseServerClient();
  const candidates: GranularityBatchCandidate[] = [];
  const excluded: Array<StructuralBatchTarget & { reason: string }> = [];
  for (const target of targets) {
    const rows = await loadQuestions(true, target);
    if (!rows.length) { excluded.push({ ...target, reason: "Não há questões ativas neste contexto." }); continue; }
    if (!rows.some((row) => hasIncisoGranularityPending(row))) { excluded.push({ ...target, reason: "Este contexto não possui pendência de granularidade." }); continue; }
    const mapping = await db.from("article_context_mappings").select("granularidade_legislacao").eq("slug", target.slug.toLowerCase()).eq("ordem", target.ordem).maybeSingle();
    if (mapping.error) throw new AdminArticleConflictError(503, "Não foi possível verificar as decisões editoriais de granularidade.");
    if (mapping.data?.granularidade_legislacao === "paragrafo_inteiro" || mapping.data?.granularidade_legislacao === "recorte_inciso") { excluded.push({ ...target, reason: "A granularidade deste contexto já foi decidida." }); continue; }
    candidates.push({ ...target, questionIds: rows.map((row) => row.id).sort() });
  }
  return { candidates, excluded };
}

export async function previewArticleGranularityBatch(input: { contexts: unknown; decision: unknown }) {
  await requireAdmin();
  const decision = granularityDecision(input.decision);
  return { ...(await granularityBatchCandidates(structuralBatchTargets(input.contexts))), decision };
}

export async function applyArticleGranularityBatch(input: { contexts: unknown; decision: unknown }) {
  await requireAdmin();
  const decision = granularityDecision(input.decision);
  const preview = await granularityBatchCandidates(structuralBatchTargets(input.contexts));
  const applied: Array<GranularityBatchCandidate & { questions: number }> = [];
  const failed: Array<StructuralBatchTarget & { reason: string }> = [...preview.excluded];
  for (const candidate of preview.candidates) {
    try {
      const result = await applyArticleContextStandardization({
        law_slug: candidate.slug.toLowerCase(), context_slug: candidate.slug.toLowerCase(), context_ordem: candidate.ordem,
        changes: {}, granularity_decision: decision, expected_question_ids: candidate.questionIds,
      });
      applied.push({ ...candidate, questions: result.questions });
    } catch (error) {
      failed.push({ slug: candidate.slug, ordem: candidate.ordem, reason: error instanceof Error ? error.message : "Não foi possível registrar esta decisão." });
    }
  }
  return { applied, failed, decision };
}

function referenceCleanupLaw(value: unknown) {
  const law = safeFilter(value, 160);
  if (law && !/^[a-z0-9-]{1,160}$/.test(law)) throw new AdminArticleConflictError(400, "Lei inválida para a limpeza de assuntos.");
  return law;
}

async function referenceCleanupCandidates(rawLaw: unknown) {
  const law = referenceCleanupLaw(rawLaw);
  if (!law) throw new AdminArticleConflictError(400, "Escolha uma lei antes de preparar a limpeza dos assuntos.", "law_required");
  const rows = await loadQuestionsForLaw(true, law);
  return rows.flatMap((row): ReferenceCleanupCandidate[] => {
    const before = row.assunto ?? "";
    const after = normalizeQuestionLegalReference(before);
    return before !== after ? [{ id: row.id, slug: row.slug.toUpperCase(), ordem: row.ordem, before, after }] : [];
  });
}

export async function previewArticleReferenceCleanup(rawLaw: unknown) {
  const user = await requireAdmin();
  const candidates = await referenceCleanupCandidates(rawLaw);
  const law = referenceCleanupLaw(rawLaw);
  const operationId = await persistConflictOperation({
    userId: user.id, lawSlug: law, action: "limpar_html_assunto", filters: { law, source: "conflicts" },
    items: candidates.map((candidate) => ({ id: candidate.id, slug: candidate.slug, ordem: candidate.ordem, pendingTypes: ["html_no_assunto"], before: { assunto: candidate.before }, after: { assunto: candidate.after } })),
  });
  return { law, candidates, sample: candidates.slice(0, 12), operationId };
}

export async function applyArticleReferenceCleanup(input: { law: unknown; expected: unknown; confirmation: string; operationId: unknown }) {
  const user = await requireAdmin();
  if (input.confirmation !== "LIMPAR ASSUNTOS") throw new AdminArticleConflictError(422, "Digite LIMPAR ASSUNTOS para confirmar.");
  const law = referenceCleanupLaw(input.law);
  const operationId = await startConflictOperation(input.operationId, "limpar_html_assunto", law);
  const candidates = await referenceCleanupCandidates(input.law);
  const expected = Array.isArray(input.expected) ? input.expected : [];
  const current = candidates.map(({ id, before, after }) => ({ id, before, after }));
  if (JSON.stringify(expected) !== JSON.stringify(current)) {
    await finishConflictOperation({ operationId, action: "limpar_html_assunto", applied: [], noChange: [], failed: current.map((candidate) => ({ id: candidate.id, reason: "Os assuntos mudaram desde a prévia." })) });
    throw new AdminArticleConflictError(409, "Os assuntos mudaram desde a prévia. Gere uma nova prévia.", "preview_changed", { operationId });
  }
  const db = getSupabaseServerClient();
  const failed: Array<{ id: string; reason: string }> = [];
  const applied: string[] = [];
  let cleaned = 0;
  for (const candidate of candidates) {
    try {
      const updated = await db.from("questions")
        .update({ assunto: candidate.after })
        .eq("id", candidate.id)
        .eq("ativo", true)
        .eq("assunto", candidate.before)
        .select("id,slug,ordem,assunto")
        .maybeSingle();
      if (updated.error) throw new Error("Não foi possível salvar o assunto.");
      if (!updated.data) throw new Error("O assunto mudou durante a limpeza.");
      const audit = await db.rpc("admin_comercial_auditar", {
        p_ator_user_id: user.id,
        p_acao: "atualizar",
        p_entidade: "questao",
        p_entidade_id: candidate.id,
        p_anterior: { assunto: candidate.before, slug: candidate.slug, ordem: candidate.ordem },
        p_posterior: { assunto: candidate.after, slug: candidate.slug, ordem: candidate.ordem },
        p_detalhes: { origem: "central_artigo_limpeza_assuntos" },
      });
      if (audit.error) console.error("Falha ao auditar limpeza de assunto", { questionId: candidate.id, code: audit.error.code });
      cleaned += 1; applied.push(candidate.id);
    } catch (error) {
      failed.push({ id: candidate.id, reason: error instanceof Error ? error.message : "Não foi possível limpar este assunto." });
    }
  }
  const operation = await finishConflictOperation({ operationId, action: "limpar_html_assunto", applied, noChange: [], failed });
  return { cleaned, failed, law, operationId, operation };
}

function shortNameStandardizationLaw(value: unknown) {
  const law = referenceCleanupLaw(value);
  if (!law) throw new AdminArticleConflictError(400, "Escolha uma lei antes de padronizar o nome curto.");
  return law;
}

async function shortNameStandardizationCandidates(rawLaw: unknown) {
  const law = shortNameStandardizationLaw(rawLaw);
  const laws = await lawMap();
  const shortName = laws.get(law.toUpperCase())?.shortName?.trim();
  if (!shortName) throw new AdminArticleConflictError(422, "Esta lei não possui nome curto cadastrado para usar como referência.");
  const rows = await loadQuestionsForLaw(true, law);
  const candidates = rows.flatMap((row): ShortNameStandardizationCandidate[] => {
    if (row.slug.toLocaleLowerCase("pt-BR") !== law) return [];
    const validation = validateQuestionStructure({ ...row, lawShortName: shortName });
    if (!validation.differences?.some((difference) => difference.startsWith("lei divergente"))) return [];
    const before = row.assunto ?? "";
    const after = canonicalizeQuestionLawReference(before, shortName);
    return after ? [{ id: row.id, slug: row.slug.toUpperCase(), ordem: row.ordem, before, after }] : [];
  });
  return { law, shortName, candidates };
}

export async function previewArticleShortNameStandardization(rawLaw: unknown) {
  const user = await requireAdmin();
  const preview = await shortNameStandardizationCandidates(rawLaw);
  const operationId = await persistConflictOperation({
    userId: user.id, lawSlug: preview.law, action: "padronizar_nome_curto", filters: { law: preview.law, source: "conflicts", shortName: preview.shortName },
    items: preview.candidates.map((candidate) => ({ id: candidate.id, slug: candidate.slug, ordem: candidate.ordem, pendingTypes: ["lei_divergente"], before: { assunto: candidate.before }, after: { assunto: candidate.after } })),
  });
  return { ...preview, sample: preview.candidates.slice(0, 12), operationId };
}

export async function applyArticleShortNameStandardization(input: { law: unknown; expected: unknown; confirmation: string; operationId: unknown }) {
  const user = await requireAdmin();
  if (input.confirmation !== "PADRONIZAR NOME") throw new AdminArticleConflictError(422, "Digite PADRONIZAR NOME para confirmar.");
  const preview = await shortNameStandardizationCandidates(input.law);
  const operationId = await startConflictOperation(input.operationId, "padronizar_nome_curto", preview.law);
  const expected = Array.isArray(input.expected) ? input.expected : [];
  const current = preview.candidates.map(({ id, before, after }) => ({ id, before, after }));
  if (JSON.stringify(expected) !== JSON.stringify(current)) {
    await finishConflictOperation({ operationId, action: "padronizar_nome_curto", applied: [], noChange: [], failed: current.map((candidate) => ({ id: candidate.id, reason: "Os assuntos mudaram desde a prévia." })) });
    throw new AdminArticleConflictError(409, "Os assuntos mudaram desde a prévia. Gere uma nova prévia.", "preview_changed", { operationId });
  }
  const db = getSupabaseServerClient();
  const failed: Array<{ id: string; reason: string }> = [];
  const applied: string[] = [];
  let standardized = 0;
  for (const candidate of preview.candidates) {
    try {
      const updated = await db.from("questions").update({ assunto: candidate.after }).eq("id", candidate.id).eq("ativo", true).eq("assunto", candidate.before).select("id").maybeSingle();
      if (updated.error) throw new Error("Não foi possível salvar o assunto.");
      if (!updated.data) throw new Error("O assunto mudou durante a padronização.");
      const audit = await db.rpc("admin_comercial_auditar", {
        p_ator_user_id: user.id, p_acao: "atualizar", p_entidade: "questao", p_entidade_id: candidate.id,
        p_anterior: { assunto: candidate.before, slug: candidate.slug, ordem: candidate.ordem },
        p_posterior: { assunto: candidate.after, slug: candidate.slug, ordem: candidate.ordem },
        p_detalhes: { origem: "central_artigo_padronizacao_nome_curto", nome_curto: preview.shortName },
      });
      if (audit.error) console.error("Falha ao auditar padronização do nome curto", { questionId: candidate.id, code: audit.error.code });
      standardized += 1; applied.push(candidate.id);
    } catch (error) {
      failed.push({ id: candidate.id, reason: error instanceof Error ? error.message : "Não foi possível padronizar este assunto." });
    }
  }
  const operation = await finishConflictOperation({ operationId, action: "padronizar_nome_curto", applied, noChange: [], failed });
  return { standardized, failed, law: preview.law, shortName: preview.shortName, operationId, operation };
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
