import "server-only";
import { createHash } from "node:crypto";
import { obterAdministrador } from "@/lib/admin-auth";
import { parseQuestionDraft, questionDeckDefaults, type QuestionDraft } from "@/lib/admin-questoes";
import { normalizeQuestionLegalReference } from "@/lib/question-legal-reference";
import { parseBulkQuestionEdit, parseBulkQuestionTextReplacement, replaceCompleteQuestionText, type BulkQuestionEditScope } from "@/lib/admin-question-bulk-edit";
import { effectiveAnkiSlug, parseAnkiTxt, validateImportSlug } from "@/lib/anki-txt-import";
import { parseLegisApkg } from "@/lib/anki-apkg-import";
import { apkgQuestionProposal, classifyApkgQuestion, hasMixedApkgBatch, validateApkgUuidUpdateProposal, type ApkgPreviewStatus } from "@/lib/apkg-question-update";
import type { ImportedQuestion, ImportIssue } from "@/lib/imported-question";
import { compareQuestionStructureNames, creatableQuestionStructureTypes, normalizeQuestionStructureName, parseQuestionStructureTxt, planQuestionDeckStructure, questionCountsByStructure, validQuestionStructureParent, type CreatableQuestionStructureType, type QuestionStructureNode, type QuestionStructureType, type StructureImportMapping } from "@/lib/questoes-structure";
import { getSupabaseServerClient } from "@/lib/supabase-server";
import { summarizeLawQuestionScopes } from "@/lib/law-question-scope-resolution";
import { ADMIN_QUESTION_SEARCH_LIMIT, ADMIN_QUESTION_SEARCH_MAX_LIMIT, adminQuestionSearchId, adminQuestionSearchTerms, parseAdminQuestionSearchFilter, parseAdminQuestionSearchSort, plainQuestionText } from "@/lib/admin-question-search";
import { descendantStructureIds, groupDuplicateQuestionStatements, introducedDuplicateQuestionStatementIds, sameStructureQuestionStatement } from "@/lib/admin-question-management";
import { groupImportSourceWarnings, importSourceKey, normalizedImportSource, validateImportSource, type ImportSourceFields } from "@/lib/legisbot/import-source";
import { getArticleContext } from "@/lib/admin-article-center-server";
import { validateQuestionStructure } from "@/lib/question-structure-consistency";
import { collectPages } from "@/lib/law-question-pagination";
import { findLawQuestionStructureGaps } from "@/lib/law-question-shadow-gaps";
import { previewConferenceListUuids } from "@/lib/admin-question-conference-lists";
import { structurePath, validateStructureReparenting, type ReparentStructureNode } from "@/lib/law-structure-reparent";

export class AdminQuestoesError extends Error { constructor(public status: number, message: string) { super(message); } }
type StructureType = CreatableQuestionStructureType;
type Law = { id: number; slug: string; titulo: string; nome_curto: string | null; codigo: string | null; ultima_alteracao_referencia: string | null; houve_alteracao_legislativa: boolean | null };
const types: StructureType[] = creatableQuestionStructureTypes;
const questionFields = "id,lei_id,structure_id,pergunta,resposta,justificativa,assunto,legislacao,ordem,titulo,total_artigos,slug,ultima_alteracao_legislativa,capitulo,secao,subsecao,artigo,ativo,created_at,updated_at";
const questionExportPageSize = 500;
const db = () => getSupabaseServerClient();
async function requireAdmin() { const user = await obterAdministrador(); if (!user) throw new AdminQuestoesError(401, "Autenticação administrativa obrigatória."); return user; }
function fail(context: string, error: { code?: string; message?: string; details?: unknown; hint?: string } | null): never { console.error("Falha na administração de questões", { context, code: error?.code ?? null, message: error?.message ?? null, details: error?.details ?? null, hint: error?.hint ?? null }); if (context.includes("sombra") && (error?.code === "42P01" || error?.code === "PGRST205")) throw new AdminQuestoesError(503, "Questões Sombra indisponíveis: aplique a migration 20261005140000_create_law_question_shadows.sql."); if (context.includes("lista_conferencia") && (error?.code === "42P01" || error?.code === "PGRST205")) throw new AdminQuestoesError(503, "Listas personalizadas indisponíveis: aplique a migration 20261013120000_create_admin_question_conference_lists.sql."); throw new AdminQuestoesError(502, "Não foi possível concluir a operação no banco de questões."); }
function slug(value: unknown) { if (typeof value !== "string" || !/^[a-z0-9-]{1,160}$/.test(value)) throw new AdminQuestoesError(400, "Lei inválida."); return value; }
function id(value: unknown) { if (!Number.isSafeInteger(Number(value)) || Number(value) < 1) throw new AdminQuestoesError(400, "Estrutura inválida."); return Number(value); }
function qid(value: unknown) { if (typeof value !== "string" || !/^[0-9a-f-]{36}$/i.test(value)) throw new AdminQuestoesError(400, "Questão inválida."); return value; }
function text(value: unknown, label: string) { if (typeof value !== "string" || !value.trim() || value.trim().length > 500) throw new AdminQuestoesError(400, `${label} inválido.`); return value.trim(); }
function type(value: unknown) { if (!types.includes(value as StructureType)) throw new AdminQuestoesError(400, "Tipo estrutural inválido."); return value as StructureType; }
function optionalId(value: unknown) { return value === null || value === undefined || value === "" ? null : id(value); }
function reparentExpected(value: unknown) {
  if (!value || Array.isArray(value) || typeof value !== "object") throw new AdminQuestoesError(400, "A prévia da estrutura é obrigatória.");
  const record = value as Record<string, unknown>;
  const parentId = record.parent_id === null ? null : id(record.parent_id);
  const order = structureOrder(record.ordem);
  if (typeof record.updated_at !== "string" || !record.updated_at) throw new AdminQuestoesError(400, "A prévia da estrutura é inválida.");
  return { parent_id: parentId, ordem: order, updated_at: record.updated_at };
}
function structureOrder(value: unknown) { if (!Number.isSafeInteger(Number(value)) || Number(value) < 0) throw new AdminQuestoesError(400, "Posição estrutural inválida."); return Number(value); }
function draft(value: unknown) { try { return parseQuestionDraft(value as Record<string, unknown>); } catch (error) { throw new AdminQuestoesError(400, error instanceof Error ? error.message : "Dados da questão inválidos."); } }
async function law(lawSlug: string): Promise<Law> { const r = await db().from("leis").select("id,slug,titulo,nome_curto,codigo,ultima_alteracao_referencia,houve_alteracao_legislativa").eq("slug", slug(lawSlug)).eq("ativo", true).maybeSingle(); if (r.error) fail("carregar_lei", r.error); if (!r.data) throw new AdminQuestoesError(404, "Lei ativa não encontrada no banco principal."); return r.data as Law; }
async function structure(leiId: number) { const r = await db().from("law_structure").select("id,lei_id,parent_id,tipo,nome,ordem,pdf_page,ativo,created_at,updated_at").eq("lei_id", leiId).eq("ativo", true).order("ordem").order("id"); if (r.error) fail("listar_estrutura", r.error); return [...(r.data ?? [])].sort(compareQuestionStructureNames) as QuestionStructureNode[]; }
async function validateStructure(leiId: number, structureId: number | null) { if (!structureId) return; const r = await db().from("law_structure").select("id").eq("id", structureId).eq("lei_id", leiId).eq("ativo", true).maybeSingle(); if (r.error) fail("validar_estrutura", r.error); if (!r.data) throw new AdminQuestoesError(422, "A estrutura selecionada não pertence à lei ativa."); }
function values(law: Law, d: QuestionDraft) { return { lei_id: law.id, structure_id: d.structure_id, pergunta: d.pergunta, resposta: d.resposta, justificativa: d.justificativa, assunto: d.assunto, legislacao: d.legislacao, ordem: d.ordem, titulo: d.titulo, total_artigos: d.total_artigos, slug: law.slug, capitulo: d.capitulo, secao: d.secao, subsecao: d.subsecao, artigo: d.artigo }; }
async function rejectDuplicateQuestion(leiId: number, d: QuestionDraft, exceptId?: string) {
  const loadPage = async (from: number, to: number) => {
    let request = db().from("questions").select("id,pergunta").eq("lei_id", leiId).eq("ativo", true);
    if (exceptId) request = request.neq("id", exceptId);
    const result = await request.order("id").range(from, to);
    if (result.error) fail("validar_duplicidade", result.error);
    return result.data ?? [];
  };
  const questions = await collectPages(loadPage, questionExportPageSize);
  if (questions.some((question) => sameStructureQuestionStatement(question, d))) {
    throw new AdminQuestoesError(409, "Já existe uma questão ativa com o mesmo enunciado nesta lei.");
  }
}

export async function listAdminQuestionLaws() { await requireAdmin(); const r = await db().from("leis").select("id,slug,titulo,nome_curto,codigo").eq("ativo", true).order("ordem").order("titulo"); if (r.error) fail("listar_leis", r.error); return r.data ?? []; }
export async function getAdminQuestionStructureCounts(lawSlug: string) {
  await requireAdmin();
  const current = await law(lawSlug);
  const [nodes, questions] = await Promise.all([
    structure(current.id),
    collectPages(async (from, to) => {
      const result = await db().from("questions").select("structure_id").eq("lei_id", current.id).eq("ativo", true).order("id").range(from, to);
      if (result.error) fail("contar_questoes_por_estrutura", result.error);
      return result.data ?? [];
    }, questionExportPageSize),
  ]);
  return { counts: questionCountsByStructure(nodes, questions as Array<{ structure_id: number | null }>) };
}
export async function listLawQuestionScopes(lawSlug: string) { await requireAdmin(); const current = await law(lawSlug); const [scopes, nodes, questions, links] = await Promise.all([db().from("recortes_leis").select("id,nome,descricao,ativo,status_publicacao,acesso_gratuito,created_at,updated_at").eq("lei_id", current.id).order("nome"), structure(current.id), db().from("questions").select("id,structure_id").eq("lei_id", current.id).eq("ativo", true), db().from("recortes_leis_estrutura").select("recorte_id,structure_id").eq("lei_id", current.id)]); if (scopes.error) fail("listar_recortes", scopes.error); if (questions.error) fail("contar_recortes", questions.error); if (links.error) fail("listar_estruturas_recortes", links.error); const scopeRows = scopes.data ?? []; const questionRows = questions.data ?? []; return { law: current, structure: nodes, questions: questionRows, unstructured_questions: questionRows.filter((question) => question.structure_id === null).length, recortes: summarizeLawQuestionScopes(scopeRows, links.data ?? [], nodes, questionRows) }; }
export async function saveLawQuestionScope(body: Record<string, unknown>) { await requireAdmin(); const current = await law(String(body.law_slug)); const name = text(body.nome, "Nome do recorte"); const description = typeof body.descricao === "string" ? body.descricao.trim() : ""; const ids = Array.isArray(body.structure_ids) ? body.structure_ids.map(Number).filter((item) => Number.isSafeInteger(item) && item > 0) : []; const suppliedId = typeof body.id === "string" && /^[0-9a-f-]{36}$/i.test(body.id) ? body.id : null; const status = body.status_publicacao === "em_breve" || body.status_publicacao === "inativa" ? body.status_publicacao : "ativa"; const free = body.acesso_gratuito === true; const result = await db().rpc("admin_salvar_recorte_lei", { p_recorte_id: suppliedId, p_lei_id: current.id, p_nome: name, p_descricao: description, p_ativo: status !== "inativa", p_status_publicacao: status, p_acesso_gratuito: free, p_structure_ids: ids }); if (result.error || !result.data) fail("salvar_recorte", result.error); return { id: result.data, lei_id: current.id, nome: name, descricao: description, status_publicacao: status, acesso_gratuito: free, structure_ids: ids }; }
export async function listQuestionContent(lawSlug: string) {
  const current = await law(lawSlug);
  const [questions, count, nodes] = await Promise.all([
    collectPages(async (from, to) => {
      const result = await db().from("questions").select(questionFields).eq("lei_id", current.id).eq("ativo", true).order("ordem").order("created_at").order("id").range(from, to);
      if (result.error) fail("listar_questoes", result.error);
      return result.data ?? [];
    }, questionExportPageSize),
    db().from("questions").select("id", { count: "exact", head: true }).eq("lei_id", current.id).eq("ativo", true),
    structure(current.id),
  ]);
  if (count.error) fail("contar_questoes", count.error);
  const questionCount = count.count ?? 0;
  if (questions.length !== questionCount) throw new AdminQuestoesError(502, "Não foi possível carregar todas as questões para a exportação.");
  return { law: current, questions, structure: nodes, questionCount };
}
export async function listAdminQuestions(lawSlug: string) { await requireAdmin(); return listQuestionContent(lawSlug); }
export async function searchAdminQuestions(input: { lawSlug: string; query?: unknown; filter?: unknown; sort?: unknown; page?: unknown; limit?: unknown; structureId?: unknown; article?: unknown }) {
  await requireAdmin(); const current = await law(input.lawSlug); const questionId = adminQuestionSearchId(input.query); const terms = adminQuestionSearchTerms(input.query); const filter = parseAdminQuestionSearchFilter(input.filter); const sort = parseAdminQuestionSearchSort(input.sort); const page = Math.max(1, Number.isSafeInteger(Number(input.page)) ? Number(input.page) : 1); const requestedLimit = Number(input.limit); const limit = Number.isSafeInteger(requestedLimit) ? Math.min(ADMIN_QUESTION_SEARCH_MAX_LIMIT, Math.max(1, requestedLimit)) : ADMIN_QUESTION_SEARCH_LIMIT; const offset = (page - 1) * limit; const nodes = await structure(current.id); const structureId = input.structureId ? id(input.structureId) : null; const structureIds = structureId ? descendantStructureIds(nodes, structureId) : [];
  let request = db().from("questions").select("id,structure_id,pergunta,resposta,artigo,assunto,ordem,ativo,updated_at", { count: "exact" }).eq("lei_id", current.id).eq("ativo", true);
  if (questionId) request = request.eq("id", questionId);
  if (filter === "certo") request = request.eq("resposta", "Certo"); else if (filter === "errado") request = request.eq("resposta", "Errado"); else if (filter === "unstructured") request = request.is("structure_id", null);
  if (structureIds.length) request = request.in("structure_id", structureIds);
  if (typeof input.article === "string" && input.article.trim()) request = request.ilike("artigo", `%${input.article.trim().slice(0, 80)}%`);
  if (!questionId) for (const term of terms) { const matchingStructures = nodes.filter((node) => `${node.nome}`.toLocaleLowerCase("pt-BR").includes(term.toLocaleLowerCase("pt-BR"))).map((node) => node.id); const predicates = ["pergunta", "justificativa", "artigo", "assunto", "legislacao", "ordem", "titulo", "capitulo", "secao", "subsecao"].map((field) => `${field}.ilike.%${term}%`); if (matchingStructures.length) predicates.push(`structure_id.in.(${matchingStructures.join(",")})`); request = request.or(predicates.join(",")); }
  request = sort === "ordem_asc" ? request.order("ordem").order("id") : sort === "ordem_desc" ? request.order("ordem", { ascending: false }).order("id", { ascending: false }) : terms.length || questionId ? request.order("ordem").order("id") : request.order("updated_at", { ascending: false }).order("id");
  const result = await request.range(offset, offset + limit - 1); if (result.error) fail("pesquisar_questoes", result.error); const total = result.count ?? 0;
  const matchingOrders = () => {
    let scoped = db().from("questions").select("ordem").eq("lei_id", current.id).eq("ativo", true);
    if (questionId) scoped = scoped.eq("id", questionId);
    if (filter === "certo") scoped = scoped.eq("resposta", "Certo"); else if (filter === "errado") scoped = scoped.eq("resposta", "Errado"); else if (filter === "unstructured") scoped = scoped.is("structure_id", null);
    if (structureIds.length) scoped = scoped.in("structure_id", structureIds);
    if (typeof input.article === "string" && input.article.trim()) scoped = scoped.ilike("artigo", `%${input.article.trim().slice(0, 80)}%`);
    if (!questionId) for (const term of terms) { const matchingStructures = nodes.filter((node) => `${node.nome}`.toLocaleLowerCase("pt-BR").includes(term.toLocaleLowerCase("pt-BR"))).map((node) => node.id); const predicates = ["pergunta", "justificativa", "artigo", "assunto", "legislacao", "ordem", "titulo", "capitulo", "secao", "subsecao"].map((field) => `${field}.ilike.%${term}%`); if (matchingStructures.length) predicates.push(`structure_id.in.(${matchingStructures.join(",")})`); scoped = scoped.or(predicates.join(",")); }
    return scoped;
  };
  const [firstOrder, lastOrder] = await Promise.all([matchingOrders().order("ordem").order("id").limit(1), matchingOrders().order("ordem", { ascending: false }).order("id", { ascending: false }).limit(1)]);
  if (firstOrder.error || lastOrder.error) fail("abrangencia_pesquisa_questoes", firstOrder.error ?? lastOrder.error);
  const range = { first_order: firstOrder.data?.[0]?.ordem ?? null, last_order: lastOrder.data?.[0]?.ordem ?? null };
  return { law: current, results: (result.data ?? []).map((question) => ({ ...question, pergunta_trecho: plainQuestionText(question.pergunta), pergunta: undefined })), total, range, page, limit, pages: Math.max(1, Math.ceil(total / limit)), query: terms.join(" "), filter, sort, structure_id: structureId };
}
function questionStructurePath(nodes: QuestionStructureNode[], structureId: number | null) {
  if (structureId === null) return "Sem estrutura";
  const labels: string[] = [];
  let current = nodes.find((node) => node.id === structureId) ?? null;
  while (current) {
    labels.unshift(current.nome);
    current = current.parent_id === null ? null : nodes.find((node) => node.id === current?.parent_id) ?? null;
  }
  return labels.length ? labels.join(" › ") : "Estrutura não encontrada";
}

/** References are searched from the same-law question index, then reloaded with the complete structural fields. */
export async function searchConferenceQuestionLinkReferences(lawSlug: string, query: unknown, questionId?: unknown) {
  await requireAdmin();
  const current = await law(lawSlug);
  const device = text(query, "Busca do dispositivo");
  const omittedId = questionId === null || questionId === undefined || questionId === "" ? null : qid(questionId);
  const search = await searchAdminQuestions({ lawSlug: current.slug, query: device, sort: "ordem_asc", page: 1, limit: 50 });
  const ids = search.results.map((item) => item.id).filter((item): item is string => typeof item === "string" && item !== omittedId);
  if (!ids.length) return { references: [] };
  const [result, nodes] = await Promise.all([
    db().from("questions").select(questionFields).eq("lei_id", current.id).eq("ativo", true).in("id", ids).order("ordem").order("id"),
    structure(current.id),
  ]);
  if (result.error) fail("buscar_referencias_vinculo", result.error);
  return {
    references: (result.data ?? []).map((question) => ({
      id: question.id,
      structure_id: question.structure_id,
      assunto: question.assunto,
      ordem: question.ordem,
      legislacao: question.legislacao,
      titulo: question.titulo,
      capitulo: question.capitulo,
      secao: question.secao,
      subsecao: question.subsecao,
      artigo: question.artigo,
      structure_label: questionStructurePath(nodes, question.structure_id),
      pergunta_trecho: plainQuestionText(question.legislacao).slice(0, 240),
      validation: validateQuestionStructure({ assunto: question.assunto, ordem: question.ordem, lawShortName: current.nome_curto ?? current.codigo }),
    })),
  };
}

/** Copies only contextual fields between two active questions of the same law. */
export async function correctAdminQuestionLinkFromReference(body: Record<string, unknown>) {
  await requireAdmin();
  const current = await law(String(body.law_slug));
  const targetId = qid(body.id);
  const referenceId = qid(body.reference_id);
  if (targetId === referenceId) throw new AdminQuestoesError(400, "Escolha outra questão como referência de vínculo.");
  const result = await db().from("questions").select(questionFields).eq("lei_id", current.id).eq("ativo", true).in("id", [targetId, referenceId]);
  if (result.error) fail("carregar_referencia_vinculo", result.error);
  const target = (result.data ?? []).find((question) => question.id === targetId);
  const reference = (result.data ?? []).find((question) => question.id === referenceId);
  if (!target || !reference) throw new AdminQuestoesError(404, "A questão ou a referência não pertence à lei selecionada.");
  return updateAdminQuestion({
    law_slug: current.slug,
    id: target.id,
    data: {
      ...target,
      pergunta: target.pergunta,
      resposta: target.resposta,
      justificativa: target.justificativa,
      structure_id: reference.structure_id,
      assunto: reference.assunto,
      legislacao: reference.legislacao,
      ordem: reference.ordem,
      titulo: reference.titulo,
      capitulo: reference.capitulo,
      secao: reference.secao,
      subsecao: reference.subsecao,
      artigo: reference.artigo,
    },
    audit_origin: "correcao_vinculo_referencia",
    audit_reference_id: reference.id,
  });
}
export async function listAdminQuestionConference(lawSlug: string, structureId: unknown) {
  await requireAdmin();
  const current = await law(lawSlug);
  const nodes = await structure(current.id);
  const rootId = optionalId(structureId);
  if (rootId === null) {
    if (nodes.length) throw new AdminQuestoesError(422, "Selecione um bloco estrutural para esta lei.");
    const result = await db().from("questions").select(questionFields).eq("lei_id", current.id).eq("ativo", true).order("ordem").order("id");
    if (result.error) fail("listar_questoes_conferencia_lei", result.error);
    return { law: current, block: { id: null, nome: "Lei completa", complete_law: true }, questions: result.data ?? [] };
  }
  const ids = descendantStructureIds(nodes, rootId);
  if (!ids.length) throw new AdminQuestoesError(404, "Bloco estrutural não encontrado para esta lei.");
  const root = nodes.find((node) => node.id === rootId);
  if (!root) throw new AdminQuestoesError(404, "Bloco estrutural não encontrado para esta lei.");
  const result = await db().from("questions").select(questionFields).eq("lei_id", current.id).eq("ativo", true).in("structure_id", ids).order("ordem").order("id");
  if (result.error) fail("listar_questoes_conferencia", result.error);
  return { law: current, block: { id: root.id, nome: root.nome }, questions: result.data ?? [] };
}

type ConferenceListRow = { id: string; lei_id: number; nome: string; created_at: string; updated_at: string };
type ConferenceListItemRow = { list_id: string; question_id: string; position: number };
function conferenceListId(value: unknown) { return qid(value); }
function conferenceListName(value: unknown) { const name = text(value, "Nome da lista"); if (name.length > 160) throw new AdminQuestoesError(400, "O nome da lista pode ter no máximo 160 caracteres."); return name; }
async function questionsByIds(leiId: number, questionIds: string[]) {
  if (!questionIds.length) return [];
  const rows: Array<Record<string, unknown>> = [];
  for (let index = 0; index < questionIds.length; index += 500) {
    const result = await db().from("questions").select(questionFields).eq("lei_id", leiId).eq("ativo", true).in("id", questionIds.slice(index, index + 500));
    if (result.error) fail("listar_lista_conferencia_questoes", result.error);
    rows.push(...(result.data ?? []));
  }
  return rows;
}
async function loadConferenceList(current: Law, rawListId: unknown) {
  const listId = conferenceListId(rawListId);
  const result = await db().from("admin_question_conference_lists").select("id,lei_id,nome,created_at,updated_at").eq("id", listId).eq("lei_id", current.id).maybeSingle();
  if (result.error) fail("carregar_lista_conferencia", result.error);
  if (!result.data) throw new AdminQuestoesError(404, "Lista personalizada não encontrada nesta lei.");
  return result.data as ConferenceListRow;
}
async function loadConferenceListImport(current: Law, source: unknown) {
  let parsed;
  try { parsed = previewConferenceListUuids(source); }
  catch (error) { throw new AdminQuestoesError(400, error instanceof Error ? error.message : "UUIDs inválidos."); }
  const found = await questionsByIds(current.id, parsed.valid_unique);
  const foundIds = new Set(found.map((question) => String(question.id).toLowerCase()));
  const found_question_ids = parsed.valid_unique.filter((id) => foundIds.has(id));
  const missing_ids = parsed.valid_unique.filter((id) => !foundIds.has(id));
  return { ...parsed, found_question_ids, missing_ids, found_count: found_question_ids.length };
}
async function touchConferenceList(listId: string) {
  const result = await db().from("admin_question_conference_lists").update({ updated_at: new Date().toISOString() }).eq("id", listId);
  if (result.error) fail("atualizar_lista_conferencia", result.error);
}
async function auditConferenceList(userId: string, action: string, listId: string, before: unknown, after: unknown, details: Record<string, unknown>) {
  const result = await db().rpc("admin_comercial_auditar", { p_ator_user_id: userId, p_acao: action, p_entidade: "lista_conferencia_questoes", p_entidade_id: listId, p_anterior: before, p_posterior: after, p_detalhes: details });
  if (result.error) console.error("Falha ao auditar lista personalizada", { listId, code: result.error.code });
}
export async function previewAdminQuestionConferenceListImport(body: Record<string, unknown>) {
  await requireAdmin();
  const current = await law(String(body.law_slug));
  return loadConferenceListImport(current, body.source ?? body.uuids);
}
export async function listAdminQuestionConferenceLists(lawSlug: string) {
  await requireAdmin();
  const current = await law(lawSlug);
  const lists = await db().from("admin_question_conference_lists").select("id,lei_id,nome,created_at,updated_at").eq("lei_id", current.id).order("updated_at", { ascending: false });
  if (lists.error) fail("listar_listas_conferencia", lists.error);
  const rows = (lists.data ?? []) as ConferenceListRow[];
  if (!rows.length) return { law: current, lists: [] };
  const ids = rows.map((list) => list.id);
  const [items, progress] = await Promise.all([
    db().from("admin_question_conference_list_items").select("list_id,question_id,position").in("list_id", ids),
    db().from("admin_question_conference_list_progress").select("list_id,question_id").in("list_id", ids),
  ]);
  if (items.error) fail("listar_lista_conferencia_itens", items.error);
  if (progress.error) fail("listar_lista_conferencia_progresso", progress.error);
  const itemRows = (items.data ?? []) as ConferenceListItemRow[];
  const progressRows = (progress.data ?? []) as Array<{ list_id: string; question_id: string }>;
  const questions = await questionsByIds(current.id, itemRows.map((item) => item.question_id));
  const available = new Set(questions.map((question) => String(question.id)));
  const reviewed = new Set(progressRows.map((item) => `${item.list_id}\u0000${item.question_id}`));
  return { law: current, lists: rows.map((list) => {
    const entries = itemRows.filter((item) => item.list_id === list.id);
    const active = entries.filter((item) => available.has(item.question_id));
    const reviewedCount = active.filter((item) => reviewed.has(`${list.id}\u0000${item.question_id}`)).length;
    return { ...list, questions_count: active.length, unavailable_count: entries.length - active.length, reviewed_count: reviewedCount, pending_count: active.length - reviewedCount };
  }) };
}
export async function createAdminQuestionConferenceList(body: Record<string, unknown>) {
  const user = await requireAdmin();
  const current = await law(String(body.law_slug));
  const name = conferenceListName(body.nome);
  const imported = await loadConferenceListImport(current, body.source ?? body.uuids);
  if (!imported.found_question_ids.length) throw new AdminQuestoesError(422, "Nenhuma questão ativa desta lei foi localizada para criar a lista.");
  const created = await db().from("admin_question_conference_lists").insert({ lei_id: current.id, nome: name, created_by: user.id }).select("id,lei_id,nome,created_at,updated_at").single();
  if (created.error || !created.data) fail("criar_lista_conferencia", created.error);
  const list = created.data as ConferenceListRow;
  const items = imported.found_question_ids.map((question_id, index) => ({ list_id: list.id, question_id, position: index + 1 }));
  const inserted = await db().from("admin_question_conference_list_items").insert(items);
  if (inserted.error) { await db().from("admin_question_conference_lists").delete().eq("id", list.id); fail("criar_lista_conferencia_itens", inserted.error); }
  await auditConferenceList(user.id, "criar", list.id, null, { ...list, questions_count: items.length }, { origem: "conferidor_uuid" });
  return { list: { ...list, questions_count: items.length, reviewed_count: 0, pending_count: items.length, unavailable_count: 0 }, import: imported };
}
export async function appendAdminQuestionConferenceList(body: Record<string, unknown>) {
  const user = await requireAdmin();
  const current = await law(String(body.law_slug));
  const list = await loadConferenceList(current, body.list_id);
  const imported = await loadConferenceListImport(current, body.source ?? body.uuids);
  const existing = await db().from("admin_question_conference_list_items").select("question_id,position").eq("list_id", list.id).order("position", { ascending: false });
  if (existing.error) fail("listar_lista_conferencia_itens", existing.error);
  const existingRows = (existing.data ?? []) as Array<{ question_id: string; position: number }>;
  const existingIds = new Set(existingRows.map((item) => item.question_id.toLowerCase()));
  const additions = imported.found_question_ids.filter((id) => !existingIds.has(id));
  const currentLastPosition = Number(existingRows[0]?.position ?? 0);
  if (additions.length) {
    const inserted = await db().from("admin_question_conference_list_items").insert(additions.map((question_id, index) => ({ list_id: list.id, question_id, position: currentLastPosition + index + 1 })));
    if (inserted.error) fail("adicionar_lista_conferencia_itens", inserted.error);
    await touchConferenceList(list.id);
    await auditConferenceList(user.id, "atualizar", list.id, { additions: [] }, { additions }, { origem: "conferidor_uuid_adicionar" });
  }
  return { added_count: additions.length, already_present_ids: imported.found_question_ids.filter((id) => existingIds.has(id)), import: imported };
}
export async function renameAdminQuestionConferenceList(body: Record<string, unknown>) {
  const user = await requireAdmin(); const current = await law(String(body.law_slug)); const list = await loadConferenceList(current, body.list_id); const name = conferenceListName(body.nome);
  const result = await db().from("admin_question_conference_lists").update({ nome: name }).eq("id", list.id).eq("lei_id", current.id).select("id,lei_id,nome,created_at,updated_at").maybeSingle();
  if (result.error) fail("renomear_lista_conferencia", result.error); if (!result.data) throw new AdminQuestoesError(404, "Lista personalizada não encontrada nesta lei.");
  await auditConferenceList(user.id, "atualizar", list.id, list, result.data, { origem: "conferidor_renomear" }); return result.data;
}
export async function deleteAdminQuestionConferenceList(body: Record<string, unknown>) {
  const user = await requireAdmin(); const current = await law(String(body.law_slug)); const list = await loadConferenceList(current, body.list_id);
  const result = await db().from("admin_question_conference_lists").delete().eq("id", list.id).eq("lei_id", current.id);
  if (result.error) fail("excluir_lista_conferencia", result.error); await auditConferenceList(user.id, "excluir", list.id, list, null, { origem: "conferidor_excluir_lista" }); return { id: list.id };
}
export async function removeAdminQuestionConferenceListItem(body: Record<string, unknown>) {
  const user = await requireAdmin(); const current = await law(String(body.law_slug)); const list = await loadConferenceList(current, body.list_id); const questionId = qid(body.question_id);
  const result = await db().from("admin_question_conference_list_items").delete().eq("list_id", list.id).eq("question_id", questionId).select("question_id").maybeSingle();
  if (result.error) fail("remover_lista_conferencia_item", result.error); if (!result.data) throw new AdminQuestoesError(404, "Questão não pertence a esta lista.");
  await touchConferenceList(list.id); await auditConferenceList(user.id, "atualizar", list.id, { question_id: questionId }, null, { origem: "conferidor_remover_questao" }); return { question_id: questionId };
}
export async function listAdminQuestionConferenceList(lawSlug: string, rawListId: unknown) {
  await requireAdmin(); const current = await law(lawSlug); const list = await loadConferenceList(current, rawListId);
  const items = await db().from("admin_question_conference_list_items").select("list_id,question_id,position").eq("list_id", list.id).order("position");
  if (items.error) fail("listar_lista_conferencia_itens", items.error);
  const entries = (items.data ?? []) as ConferenceListItemRow[]; const questions = await questionsByIds(current.id, entries.map((item) => item.question_id)); const byId = new Map(questions.map((question) => [String(question.id), question]));
  const progress = await db().from("admin_question_conference_list_progress").select("question_id").eq("list_id", list.id);
  if (progress.error) fail("listar_lista_conferencia_progresso", progress.error);
  const progressRows = (progress.data ?? []) as Array<{ question_id: string }>;
  const availableIds = new Set(entries.filter((item) => byId.has(item.question_id)).map((item) => item.question_id));
  const reviewed_question_ids = progressRows.flatMap((row) => availableIds.has(row.question_id) ? [row.question_id] : []);
  return { law: current, list: { ...list, total: availableIds.size, reviewed_count: reviewed_question_ids.length, pending_count: availableIds.size - reviewed_question_ids.length, unavailable_count: entries.length - availableIds.size }, questions: entries.flatMap((item) => byId.has(item.question_id) ? [byId.get(item.question_id)!] : []), reviewed_question_ids };
}
export async function setAdminQuestionConferenceListProgress(body: Record<string, unknown>) {
  const user = await requireAdmin(); const current = await law(String(body.law_slug)); const list = await loadConferenceList(current, body.list_id); const questionId = qid(body.question_id);
  if (typeof body.reviewed !== "boolean") throw new AdminQuestoesError(400, "Status de conferência inválido.");
  const question = await db().from("questions").select("id").eq("id", questionId).eq("lei_id", current.id).eq("ativo", true).maybeSingle();
  if (question.error) fail("validar_lista_conferencia_questao", question.error); if (!question.data) throw new AdminQuestoesError(404, "Questão ativa não encontrada nesta lei.");
  const membership = await db().from("admin_question_conference_list_items").select("question_id").eq("list_id", list.id).eq("question_id", questionId).maybeSingle();
  if (membership.error) fail("validar_lista_conferencia_item", membership.error); if (!membership.data) throw new AdminQuestoesError(404, "Questão não pertence a esta lista.");
  const result = body.reviewed ? await db().from("admin_question_conference_list_progress").upsert({ list_id: list.id, question_id: questionId, reviewed_at: new Date().toISOString(), reviewed_by: user.id }, { onConflict: "list_id,question_id" }) : await db().from("admin_question_conference_list_progress").delete().eq("list_id", list.id).eq("question_id", questionId);
  if (result.error) fail("salvar_lista_conferencia_progresso", result.error); await touchConferenceList(list.id); return { question_id: questionId, reviewed: body.reviewed };
}
export async function getAdminQuestionStructureReviews(lawSlug: string) {
  await requireAdmin();
  const current = await law(lawSlug);
  const [result, lawReview] = await Promise.all([
    db().from("admin_question_structure_reviews").select("structure_id").eq("lei_id", current.id),
    db().from("admin_question_law_reviews").select("lei_id").eq("lei_id", current.id).maybeSingle(),
  ]);
  if (result.error) fail("carregar_revisoes_estruturais", result.error);
  if (lawReview.error) fail("carregar_revisao_lei", lawReview.error);
  return { reviewed: (result.data ?? []).map((row) => Number(row.structure_id)).filter((value) => Number.isSafeInteger(value)), law_reviewed: Boolean(lawReview.data) };
}
export async function setAdminQuestionStructureReview(body: Record<string, unknown>) {
  const admin = await obterAdministrador();
  if (!admin) throw new AdminQuestoesError(401, "Autenticação administrativa obrigatória.");
  const current = await law(String(body.law_slug));
  const structureId = optionalId(body.structure_id);
  if (typeof body.reviewed !== "boolean") throw new AdminQuestoesError(400, "Marcação de revisão inválida.");
  if (structureId === null) {
    const nodes = await structure(current.id);
    if (nodes.length) throw new AdminQuestoesError(422, "A marcação da lei completa só está disponível quando não há estrutura cadastrada.");
    const result = body.reviewed
      ? await db().from("admin_question_law_reviews").upsert({ lei_id: current.id, reviewed_at: new Date().toISOString(), reviewed_by: admin.id }, { onConflict: "lei_id" })
      : await db().from("admin_question_law_reviews").delete().eq("lei_id", current.id);
    if (result.error) fail("salvar_revisao_lei", result.error);
    return { structure_id: null, reviewed: body.reviewed };
  }
  await validateStructure(current.id, structureId);
  const result = body.reviewed
    ? await db().from("admin_question_structure_reviews").upsert({ lei_id: current.id, structure_id: structureId, reviewed_at: new Date().toISOString(), reviewed_by: admin.id }, { onConflict: "lei_id,structure_id" })
    : await db().from("admin_question_structure_reviews").delete().eq("lei_id", current.id).eq("structure_id", structureId);
  if (result.error) fail("salvar_revisao_estrutural", result.error);
  return { structure_id: structureId, reviewed: body.reviewed };
}
export async function conferenceArticleContext(lawSlug: string, orderValue: unknown) {
  await requireAdmin();
  const current = await law(lawSlug);
  const ordem = typeof orderValue === "string" ? orderValue.trim() : "";
  if (!ordem) throw new AdminQuestoesError(400, "Informe a ordem para consultar o contexto.");
  const context = await getArticleContext(current.slug, ordem);
  if (!context) return { status: "absent" as const, assunto: null, legislacao: null };
  if (!context.trusted) return { status: "conflict" as const, assunto: null, legislacao: null };
  return { status: "found" as const, assunto: context.assunto, legislacao: context.legislacao };
}
export async function conferenceArticleLink(lawSlug: string, orderValue: unknown) {
  await requireAdmin();
  const current = await law(lawSlug);
  const ordem = typeof orderValue === "string" ? orderValue.trim() : "";
  if (!ordem) throw new AdminQuestoesError(400, "Informe a ordem para consultar o artigo.");
  const context = await getArticleContext(current.slug, ordem);
  if (!context) return { status: "absent" as const, href: null };
  const href = `/admin/artigos/${encodeURIComponent(current.slug.toLowerCase())}/${encodeURIComponent(context.ordem)}?aba=artigo&lei=${encodeURIComponent(current.slug.toLowerCase())}`;
  return { status: context.trusted ? "found" as const : "conflict" as const, href };
}

type ShadowStoredUnit = { id: string; identity_key: string; ordem: string | null; assunto: string; tipo: "caput" | "paragrafo"; texto_html: string; texto_plano: string; caminho_estrutural: string[]; decision: "nao_cabe_questao" | "revogado" | null };
function shadowCoverage(units: ShadowStoredUnit[]) {
  return units.map((unit) => {
    const status = unit.decision ? "dispensada" : "sombra";
    return { ...unit, status, question_ids: [], conflict_question_ids: [] };
  });
}
async function synchronizeAutomaticQuestionShadows(law: Law, nodes: QuestionStructureNode[], questions: Array<{ structure_id: number | null }>) {
  const gaps = findLawQuestionStructureGaps(nodes, questions);
  if (!gaps.length) return gaps;
  const now = new Date().toISOString();
  const result = await db().from("admin_law_question_shadow_units").upsert(gaps.map((gap) => ({ lei_id: law.id, identity_key: gap.identityKey, ordem: null, assunto: gap.assunto, tipo: "caput", texto_html: "", texto_plano: "", caminho_estrutural: gap.path, source_fingerprint: `automatic-structure-v1:${gap.structureId}`, last_seen_at: now })), { onConflict: "lei_id,identity_key" });
  if (result.error) fail("sincronizar_sombras_automaticas", result.error);
  return gaps;
}
export async function getLawQuestionShadows(lawSlug: string) {
  await requireAdmin(); const current = await law(lawSlug);
  const [questions, nodes] = await Promise.all([db().from("questions").select("id,structure_id").eq("lei_id", current.id).eq("ativo", true).order("ordem").order("id"), structure(current.id)]);
  if (questions.error) fail("comparar_sombras", questions.error);
  const questionRows = (questions.data ?? []) as Array<{ id: string; structure_id: number | null }>;
  const gaps = await synchronizeAutomaticQuestionShadows(current, nodes, questionRows);
  const units = await db().from("admin_law_question_shadow_units").select("id,identity_key,ordem,assunto,tipo,texto_html,texto_plano,caminho_estrutural,decision").eq("lei_id", current.id).like("identity_key", "automatic-structure:%").order("first_seen_at");
  if (units.error) fail("listar_sombras", units.error);
  const activeKeys = new Set(gaps.map((gap) => gap.identityKey));
  const covered = shadowCoverage(((units.data ?? []) as ShadowStoredUnit[]).filter((unit) => activeKeys.has(unit.identity_key)));
  return { units: covered };
}
export async function setLawQuestionShadowDecision(body: Record<string, unknown>) {
  const admin = await requireAdmin(); const current = await law(String(body.law_slug)); const unitId = qid(body.unit_id); const decision = body.decision === "nao_cabe_questao" || body.decision === "revogado" ? body.decision : body.decision === null ? null : undefined;
  if (decision === undefined) throw new AdminQuestoesError(400, "Decisão da Questão Sombra inválida.");
  const result = await db().from("admin_law_question_shadow_units").update({ decision, decided_at: decision ? new Date().toISOString() : null, decided_by: decision ? admin.id : null }).eq("id", unitId).eq("lei_id", current.id).like("identity_key", "automatic-structure:%").select("id").maybeSingle();
  if (result.error) fail("decidir_sombra", result.error); if (!result.data) throw new AdminQuestoesError(404, "Unidade da Questão Sombra não pertence à lei atual.");
  return await getLawQuestionShadows(current.slug);
}
export async function getLawQuestionShadowDraft(lawSlug: string, unitId: unknown) {
  await requireAdmin(); const current = await law(lawSlug); const result = await db().from("admin_law_question_shadow_units").select("id,identity_key,decision").eq("id", qid(unitId)).eq("lei_id", current.id).like("identity_key", "automatic-structure:%").maybeSingle();
  if (result.error) fail("carregar_sombra_para_questao", result.error); const structureMatch = result.data?.identity_key.match(/^automatic-structure:(\d+)$/); if (!result.data || result.data.decision || !structureMatch) throw new AdminQuestoesError(422, "Esta Questão Sombra não possui um bloco estrutural disponível.");
  const [nodes, deckDefaults] = await Promise.all([
    structure(current.id),
    getLawQuestionDeckDefaults(current.id),
  ]);
  const structureId = Number(structureMatch[1]); if (!nodes.some((node) => node.id === structureId)) throw new AdminQuestoesError(422, "O bloco estrutural desta Questão Sombra não está mais ativo.");
  return { unit_id: result.data.id, data: { ...blankShadowQuestion("", "", ""), ...deckDefaults, structure_id: structureId }, structure_warning: "O bloco estrutural já foi preenchido. Informe Assunto, Ordem e legislação antes de salvar a questão." };
}
function blankShadowQuestion(ordem: string, assunto: string, legislacao: string): QuestionDraft { return { structure_id: null, pergunta: "", resposta: "Certo", justificativa: "", assunto, legislacao, ordem, titulo: "", total_artigos: null, capitulo: "", secao: "", subsecao: "", artigo: "" }; }
async function getLawQuestionDeckDefaults(leiId: number) {
  const rows = await collectPages(async (from, to) => {
    const result = await db().from("questions").select("titulo,total_artigos").eq("lei_id", leiId).eq("ativo", true).order("id").range(from, to);
    if (result.error) fail("carregar_padrao_baralho", result.error);
    return result.data ?? [];
  }, questionExportPageSize);
  return questionDeckDefaults(rows);
}
export async function getLegisBotQuestionDraft(lawSlug: string, commentId: unknown) {
  await requireAdmin();
  const current = await law(lawSlug);
  const result = await db()
    .from("legisbot_comentarios")
    .select("id,slug,ordem,assunto,legislacao")
    .eq("id", id(commentId))
    .eq("slug", current.slug.toUpperCase())
    .eq("context_kind", "shadow_question")
    .maybeSingle();
  if (result.error) fail("carregar_legisbot_para_questao", result.error);
  if (!result.data) throw new AdminQuestoesError(404, "Contexto do LegisBot não encontrado para esta lei.");
  if (validateQuestionStructure({ assunto: result.data.assunto, ordem: result.data.ordem }).status !== "valid") {
    throw new AdminQuestoesError(422, "O contexto do LegisBot precisa de Assunto e Ordem confiáveis antes de criar uma questão.");
  }
  return {
    comment_id: Number(result.data.id),
    data: { ...blankShadowQuestion(result.data.ordem, result.data.assunto, result.data.legislacao), structure_id: null },
    structure_warning: null,
  };
}
export async function getAdminQuestion(lawSlug: string, questionId: unknown) { await requireAdmin(); const current = await law(lawSlug); const result = await db().from("questions").select(questionFields).eq("id", qid(questionId)).eq("lei_id", current.id).maybeSingle(); if (result.error) fail("carregar_questao", result.error); if (!result.data) throw new AdminQuestoesError(404, "Questão não encontrada para a lei selecionada."); return { law: current, question: result.data }; }
export async function createAdminQuestion(body: Record<string, unknown>) { await requireAdmin(); const current = await law(String(body.law_slug)); const d = draft(body.data); const nodes = await structure(current.id); if (nodes.length && d.structure_id === null) throw new AdminQuestoesError(400, "Informe a estrutura para esta lei."); if (d.total_artigos === null || d.total_artigos < 1) throw new AdminQuestoesError(400, "Informe o Total de artigos para exportação Anki."); await validateStructure(current.id, d.structure_id); await rejectDuplicateQuestion(current.id, d); const r = await db().from("questions").insert({ ...values(current, d), ativo: true }).select(questionFields).single(); if (r.error || !r.data) fail("criar_questao", r.error); const legisBotId = body.legisbot_id === null || body.legisbot_id === undefined || body.legisbot_id === "" ? null : Number(body.legisbot_id); if (legisBotId !== null && Number.isSafeInteger(legisBotId)) { const converted = await db().from("legisbot_comentarios").update({ context_kind: "comment", status: "pendente", comentario: null, precisa_revisao: false }).eq("id", legisBotId).eq("slug", current.slug.toUpperCase()).eq("ordem", d.ordem).eq("context_kind", "shadow_question"); if (converted.error) fail("converter_sombra_legisbot", converted.error); } return r.data; }
export async function updateAdminQuestion(body: Record<string, unknown>) { const user = await requireAdmin(); const current = await law(String(body.law_slug)); const questionId = qid(body.id); const d = draft(body.data); await validateStructure(current.id, d.structure_id); const before = await db().from("questions").select(questionFields).eq("id", questionId).eq("lei_id", current.id).eq("ativo", true).maybeSingle(); if (before.error) fail("ler_questao_antes_edicao", before.error); if (!before.data) throw new AdminQuestoesError(404, "Questão ativa não encontrada para a lei selecionada."); const r = await db().from("questions").update(values(current, d)).eq("id", questionId).eq("lei_id", current.id).eq("ativo", true).select(questionFields).maybeSingle(); if (r.error) fail("editar_questao", r.error); if (!r.data) throw new AdminQuestoesError(404, "Questão ativa não encontrada para a lei selecionada."); const auditOrigin = body.audit_origin === "correcao_vinculo_referencia" ? "correcao_vinculo_referencia" : "editor_questoes"; const auditReferenceId = auditOrigin === "correcao_vinculo_referencia" && typeof body.audit_reference_id === "string" && /^[0-9a-f-]{36}$/i.test(body.audit_reference_id) ? body.audit_reference_id : null; const audit = await db().rpc("admin_comercial_auditar", { p_ator_user_id: user.id, p_acao: "atualizar", p_entidade: "questao", p_entidade_id: questionId, p_anterior: before.data, p_posterior: r.data, p_detalhes: { origem: auditOrigin, referencia_questao_id: auditReferenceId, slug: before.data.slug, ordem_anterior: before.data.ordem, ordem_posterior: d.ordem } }); if (audit.error) console.error("Falha ao auditar edição individual de questão", { questionId, code: audit.error.code }); const sourceChanged = normalizedImportSource({ titulo: String(before.data.titulo ?? ""), assunto: String(before.data.assunto ?? ""), legislacao: String(before.data.legislacao ?? "") }) !== normalizedImportSource({ titulo: d.titulo ?? "", assunto: d.assunto ?? "", legislacao: d.legislacao ?? "" }); const identifiersChanged = String(before.data.ordem) !== d.ordem; if (sourceChanged || identifiersChanged) { const oldReview = await db().from("legisbot_comentarios").update({ precisa_revisao: true }).eq("slug", String(before.data.slug).toUpperCase()).eq("ordem", String(before.data.ordem)); if (oldReview.error) fail("sinalizar_revisao_apos_edicao", oldReview.error); if (identifiersChanged) { const newReview = await db().from("legisbot_comentarios").update({ precisa_revisao: true }).eq("slug", current.slug.toUpperCase()).eq("ordem", d.ordem); if (newReview.error) fail("sinalizar_revisao_nova_ordem", newReview.error); } } return r.data; }
export async function updateQuickAdminQuestion(body: Record<string, unknown>) { await requireAdmin(); const current = await law(String(body.law_slug)); const question = await db().from("questions").select(questionFields).eq("id", qid(body.id)).eq("lei_id", current.id).eq("ativo", true).maybeSingle(); if (question.error) fail("ler_questao", question.error); if (!question.data) throw new AdminQuestoesError(404, "Questão ativa não encontrada para a lei selecionada."); const input = body.data as Record<string, unknown>; if (!input || Object.keys(input).some((key) => !["pergunta","resposta","justificativa","assunto","legislacao","ordem"].includes(key))) throw new AdminQuestoesError(400, "A edição rápida não permite alterar a estrutura da questão."); return updateAdminQuestion({ law_slug: current.slug, id: question.data.id, data: { ...question.data, ...input } }); }
async function deleteContentRpc(current: Law, userId: string, questionIds: string[] | null, structureId: number | null, execute: boolean, confirmation?: unknown, jobAction?: unknown) { const result = await db().rpc("admin_delete_law_content_v3", { p_lei_id: current.id, p_question_ids: questionIds, p_structure_id: structureId, p_actor_user_id: userId, p_confirmation: typeof confirmation === "string" ? confirmation : null, p_execute: execute, p_job_action: jobAction === "detach_completed" || jobAction === "cancel_active" ? jobAction : null }); if (result.error) throw new AdminQuestoesError(result.error.code === "42501" ? 403 : 422, result.error.message); if (!result.data) throw new AdminQuestoesError(404, "Conteúdo não encontrado para exclusão."); return result.data as Record<string, unknown>; }
export async function questionDeletionSummary(body: Record<string, unknown>) { const user = await requireAdmin(); const current = await law(String(body.law_slug)); return deleteContentRpc(current, user.id, [qid(body.id)], null, false); }
export async function deleteAdminQuestion(body: Record<string, unknown>) { const user = await requireAdmin(); const current = await law(String(body.law_slug)); return deleteContentRpc(current, user.id, [qid(body.id)], null, true, body.confirmation); }
async function bulkQuestionIds(current: Law, body: Record<string, unknown>) {
  const scope = body.scope;
  if (scope === "all") { const result = await db().from("questions").select("id").eq("lei_id", current.id).eq("ativo", true); if (result.error) fail("selecionar_todas_questoes", result.error); return (result.data ?? []).map((row) => String(row.id)); }
  if (scope === "structure") { const nodeId = id(body.structure_id); const nodes = await structure(current.id); const descendants = descendantStructureIds(nodes, nodeId); if (!descendants.length) throw new AdminQuestoesError(404, "Estrutura não encontrada para esta lei."); const result = await db().from("questions").select("id").eq("lei_id", current.id).eq("ativo", true).in("structure_id", descendants); if (result.error) fail("selecionar_questoes_estrutura", result.error); return (result.data ?? []).map((row) => String(row.id)); }
  if (scope === "questions") { const ids = Array.isArray(body.question_ids) ? body.question_ids.map(qid) : []; if (!ids.length || new Set(ids).size !== ids.length) throw new AdminQuestoesError(400, "Informe uma lista não vazia de questões sem duplicidades."); return ids; }
  if (scope === "results") { const ids: string[] = []; let page = 1; let pages = 1; do { const result = await searchAdminQuestions({ lawSlug: current.slug, query: body.query, filter: body.filter, article: body.article, structureId: body.structure_id, page, limit: ADMIN_QUESTION_SEARCH_MAX_LIMIT }); ids.push(...result.results.map((row) => row.id)); pages = result.pages; page += 1; } while (page <= pages); return ids; }
  throw new AdminQuestoesError(400, "Escopo de exclusão em massa inválido.");
}

async function bulkQuestionEditIds(current: Law, body: Record<string, unknown>, scope: BulkQuestionEditScope) {
  if (scope === "all") { const result = await db().from("questions").select("id").eq("lei_id", current.id).eq("ativo", true); if (result.error) fail("selecionar_todas_questoes_edicao", result.error); return (result.data ?? []).map((row) => String(row.id)); }
  if (scope === "results") { const ids: string[] = []; let page = 1; let pages = 1; do { const result = await searchAdminQuestions({ lawSlug: current.slug, query: body.query, filter: body.filter, article: body.article, structureId: body.structure_id, page, limit: ADMIN_QUESTION_SEARCH_MAX_LIMIT }); ids.push(...result.results.map((row) => row.id)); pages = result.pages; page += 1; } while (page <= pages); return ids; }
  const ids = Array.isArray(body.question_ids) ? body.question_ids.map(qid) : [];
  if (!ids.length || new Set(ids).size !== ids.length) throw new AdminQuestoesError(400, "Selecione uma ou mais questões sem duplicidades.");
  return ids;
}

type BulkQuestionEditPreview = { field: string; value: unknown; selection_count: number; changed_count: number; unchanged_count: number; sample: Array<{ id: string; before: unknown; after: unknown }>; expected: Array<{ id: string; before: unknown }> };
async function resolveBulkQuestionEdit(body: Record<string, unknown>): Promise<{ current: Law; user: { id: string }; parsed: ReturnType<typeof parseBulkQuestionEdit>; ids: string[]; preview: BulkQuestionEditPreview }> {
  const user = await requireAdmin(); const current = await law(String(body.law_slug)); let parsed: ReturnType<typeof parseBulkQuestionEdit>;
  try { parsed = parseBulkQuestionEdit(body); } catch (error) { throw new AdminQuestoesError(400, error instanceof Error ? error.message : "Edição em lote inválida."); }
  if (parsed.field === "structure_id") await validateStructure(current.id, parsed.value as number | null);
  const ids = await bulkQuestionEditIds(current, body, parsed.scope);
  if (!ids.length) throw new AdminQuestoesError(422, "Não há questões nesta abrangência.");
  const selected = await db().from("questions").select(`id,${parsed.field}`).eq("lei_id", current.id).eq("ativo", true).in("id", ids).order("id");
  if (selected.error) fail("carregar_edicao_lote", selected.error);
  if ((selected.data?.length ?? 0) !== ids.length) throw new AdminQuestoesError(409, "A seleção mudou ou contém questão de outra lei. Gere uma nova prévia.");
  const rows = (selected.data ?? []) as Array<Record<string, unknown> & { id: string }>;
  if (typeof body.context_slug === "string" && typeof body.context_ordem === "string") {
    const contextRows = await db().from("questions").select("id").eq("lei_id", current.id).eq("ativo", true).eq("slug", body.context_slug.toLowerCase()).eq("ordem", body.context_ordem).in("id", ids);
    if (contextRows.error) fail("validar_contexto_edicao_lote", contextRows.error);
    if ((contextRows.data?.length ?? 0) !== ids.length) throw new AdminQuestoesError(409, "A seleção contém questão fora do artigo atual. Gere uma nova prévia.");
  }
  const changed = rows.filter((row) => row[parsed.field] !== parsed.value);
  return { current, user, parsed, ids: rows.map((row) => String(row.id)), preview: { field: parsed.field, value: parsed.value, selection_count: rows.length, changed_count: changed.length, unchanged_count: rows.length - changed.length, sample: changed.slice(0, 8).map((row) => ({ id: String(row.id), before: row[parsed.field], after: parsed.value })), expected: rows.map((row) => ({ id: String(row.id), before: row[parsed.field] })) } };
}

export async function previewBulkQuestionEdit(body: Record<string, unknown>) { const resolved = await resolveBulkQuestionEdit(body); return { law: { id: resolved.current.id, slug: resolved.current.slug, titulo: resolved.current.titulo }, ...resolved.preview }; }
export async function applyBulkQuestionEdit(body: Record<string, unknown>) {
  const resolved = await resolveBulkQuestionEdit(body);
  const expected = Array.isArray(body.expected) ? body.expected : [];
  if (JSON.stringify(expected) !== JSON.stringify(resolved.preview.expected)) throw new AdminQuestoesError(409, "As questões mudaram desde a prévia. Gere uma nova prévia.");
  const result = await db().rpc("admin_bulk_update_law_questions", { p_lei_id: resolved.current.id, p_question_ids: resolved.ids, p_field: resolved.parsed.field, p_value: resolved.parsed.value, p_expected: resolved.preview.expected, p_actor_user_id: resolved.user.id });
  if (result.error) throw new AdminQuestoesError(result.error.code === "42501" ? 403 : result.error.code === "40001" ? 409 : 422, result.error.message);
  return result.data;
}

type BulkQuestionTextReplacementPreview = { field: string; find: string; replace: string; selection_count: number; changed_count: number; unchanged_count: number; sample: Array<{ id: string; before: unknown; after: unknown }>; expected: Array<{ id: string; before: unknown }> };
async function resolveBulkQuestionTextReplacement(body: Record<string, unknown>): Promise<{ current: Law; user: { id: string }; parsed: ReturnType<typeof parseBulkQuestionTextReplacement>; ids: string[]; preview: BulkQuestionTextReplacementPreview }> {
  const user = await requireAdmin(); const current = await law(String(body.law_slug)); let parsed: ReturnType<typeof parseBulkQuestionTextReplacement>;
  try { parsed = parseBulkQuestionTextReplacement(body); } catch (error) { throw new AdminQuestoesError(400, error instanceof Error ? error.message : "Substituição em lote inválida."); }
  const ids = await bulkQuestionEditIds(current, body, parsed.scope);
  if (!ids.length) throw new AdminQuestoesError(422, "Não há questões nesta abrangência.");
  const selected = await db().from("questions").select(`id,${parsed.field}`).eq("lei_id", current.id).eq("ativo", true).in("id", ids).order("id");
  if (selected.error) fail("carregar_substituicao_lote", selected.error);
  if ((selected.data?.length ?? 0) !== ids.length) throw new AdminQuestoesError(409, "A seleção mudou ou contém questão de outra lei. Gere uma nova prévia.");
  const rows = (selected.data ?? []) as Array<Record<string, unknown> & { id: string }>;
  const replacement = (before: unknown) => {
    if (typeof before !== "string" || !before.includes(parsed.find)) return before;
    return replaceCompleteQuestionText(before, parsed.find, parsed.replace) || null;
  };
  const changed = rows.map((row) => ({ id: String(row.id), before: row[parsed.field], after: replacement(row[parsed.field]) })).filter((row) => row.before !== row.after);
  return { current, user, parsed, ids: rows.map((row) => String(row.id)), preview: { field: parsed.field, find: parsed.find, replace: parsed.replace, selection_count: rows.length, changed_count: changed.length, unchanged_count: rows.length - changed.length, sample: changed.slice(0, 8), expected: rows.map((row) => ({ id: String(row.id), before: row[parsed.field] })) } };
}

export async function previewBulkQuestionTextReplacement(body: Record<string, unknown>) { const resolved = await resolveBulkQuestionTextReplacement(body); return { law: { id: resolved.current.id, slug: resolved.current.slug, titulo: resolved.current.titulo }, ...resolved.preview }; }
export async function applyBulkQuestionTextReplacement(body: Record<string, unknown>) {
  const resolved = await resolveBulkQuestionTextReplacement(body);
  const expected = Array.isArray(body.expected) ? body.expected : [];
  if (JSON.stringify(expected) !== JSON.stringify(resolved.preview.expected)) throw new AdminQuestoesError(409, "As questões mudaram desde a prévia. Gere uma nova prévia.");
  const result = await db().rpc("admin_bulk_replace_law_question_text", { p_lei_id: resolved.current.id, p_question_ids: resolved.ids, p_field: resolved.parsed.field, p_find: resolved.parsed.find, p_replace: resolved.parsed.replace, p_expected: resolved.preview.expected, p_actor_user_id: resolved.user.id });
  if (result.error) throw new AdminQuestoesError(result.error.code === "42501" ? 403 : result.error.code === "40001" ? 409 : 422, result.error.message);
  return result.data;
}
export async function bulkQuestionDeletionSummary(body: Record<string, unknown>) { const user = await requireAdmin(); const current = await law(String(body.law_slug)); const ids = await bulkQuestionIds(current, body); if (!ids.length) throw new AdminQuestoesError(422, "Não há questões para excluir neste escopo."); return deleteContentRpc(current, user.id, ids, null, false); }
export async function deleteBulkAdminQuestions(body: Record<string, unknown>) { const user = await requireAdmin(); const current = await law(String(body.law_slug)); if (body.confirmation !== "EXCLUIR") throw new AdminQuestoesError(422, "Digite EXCLUIR para confirmar a exclusão em massa."); const ids = await bulkQuestionIds(current, body); if (!ids.length) throw new AdminQuestoesError(422, "Não há questões para excluir neste escopo."); return deleteContentRpc(current, user.id, ids, null, true, body.confirmation); }
export async function deactivateAdminQuestion(body: Record<string, unknown>) { const user = await requireAdmin(); const current = await law(String(body.law_slug)); const questionId = qid(body.id); const before = await db().from("questions").select(questionFields).eq("id", questionId).eq("lei_id", current.id).eq("ativo", true).maybeSingle(); if (before.error) fail("ler_questao_antes_inativar", before.error); if (!before.data) throw new AdminQuestoesError(404, "Questão ativa não encontrada para a lei selecionada."); const r = await db().from("questions").update({ ativo: false }).eq("id", questionId).eq("lei_id", current.id).eq("ativo", true).select(questionFields).maybeSingle(); if (r.error) fail("desativar_questao", r.error); if (!r.data) throw new AdminQuestoesError(404, "Questão ativa não encontrada para a lei selecionada."); const audit = await db().rpc("admin_comercial_auditar", { p_ator_user_id: user.id, p_acao: "inativar", p_entidade: "questao", p_entidade_id: questionId, p_anterior: before.data, p_posterior: r.data, p_detalhes: { origem: "administracao_questoes", slug: before.data.slug, ordem: before.data.ordem } }); if (audit.error) console.error("Falha ao auditar inativação de questão", { questionId, code: audit.error.code }); return { id: r.data.id, ativo: false }; }
export async function reactivateAdminQuestion(body: Record<string, unknown>) { await requireAdmin(); const current = await law(String(body.law_slug)); const r = await db().from("questions").update({ ativo: true }).eq("id", qid(body.id)).eq("lei_id", current.id).eq("ativo", false).select("id").maybeSingle(); if (r.error) fail("reativar_questao", r.error); if (!r.data) throw new AdminQuestoesError(404, "Questão inativa não encontrada para a lei selecionada."); return { id: r.data.id, ativo: true }; }
export async function moveAdminQuestion(body: Record<string, unknown>) { await requireAdmin(); const current = await law(String(body.law_slug)); const destination = optionalId(body.structure_id); await validateStructure(current.id, destination); const r = await db().from("questions").update({ structure_id: destination }).eq("id", qid(body.id)).eq("lei_id", current.id).eq("ativo", true).select("id").maybeSingle(); if (r.error) fail("mover_questao", r.error); if (!r.data) throw new AdminQuestoesError(404, "Questão ativa não encontrada."); return { id: r.data.id, structure_id: destination }; }

export async function createStructureNode(body: Record<string, unknown>) { await requireAdmin(); const current = await law(String(body.law_slug)); const nodeType = type(body.tipo); const parentId = optionalId(body.parent_id); if (parentId) { const r = await db().from("law_structure").select("tipo").eq("id", parentId).eq("lei_id", current.id).eq("ativo", true).maybeSingle(); if (r.error) fail("validar_pai", r.error); if (!r.data || !validQuestionStructureParent(nodeType, r.data.tipo as QuestionStructureType)) throw new AdminQuestoesError(422, "Relação estrutural inválida para esta lei."); } else if (!validQuestionStructureParent(nodeType, null)) throw new AdminQuestoesError(422, "Este nível exige um nível pai compatível."); const r = await db().from("law_structure").insert({ lei_id: current.id, parent_id: parentId, tipo: nodeType, nome: text(body.nome, "Nome"), ordem: structureOrder(body.ordem ?? 0), ativo: true }).select().single(); if (r.error || !r.data) fail("criar_estrutura", r.error); return r.data; }
export async function updateStructureNode(body: Record<string, unknown>) { await requireAdmin(); const current = await law(String(body.law_slug)); const patch: { nome: string; ordem?: number; pdf_page?: number | null } = { nome: text(body.nome, "Nome") }; if ("ordem" in body) patch.ordem = structureOrder(body.ordem); if ("pdf_page" in body) { const page = body.pdf_page === null || body.pdf_page === "" ? null : Number(body.pdf_page); if (page !== null && (!Number.isSafeInteger(page) || page < 1)) throw new AdminQuestoesError(400, "Página do PDF inválida."); patch.pdf_page = page; } const r = await db().from("law_structure").update(patch).eq("id", id(body.id)).eq("lei_id", current.id).eq("ativo", true).select().maybeSingle(); if (r.error) fail("editar_estrutura", r.error); if (!r.data) throw new AdminQuestoesError(404, "Estrutura ativa não encontrada."); return r.data; }
export async function reorderStructureNodes(body: Record<string, unknown>) { await requireAdmin(); const current = await law(String(body.law_slug)); const ids = Array.isArray(body.ids) ? body.ids.map(id) : []; if (ids.length < 2 || new Set(ids).size !== ids.length) throw new AdminQuestoesError(400, "Informe uma ordem válida de estruturas irmãs."); const selected = await db().from("law_structure").select("id,parent_id").eq("lei_id", current.id).eq("ativo", true).in("id", ids); if (selected.error) fail("carregar_estruturas", selected.error); if ((selected.data?.length ?? 0) !== ids.length) throw new AdminQuestoesError(404, "Uma das estruturas não pertence à lei selecionada."); const parentId = selected.data?.[0]?.parent_id ?? null; if (selected.data?.some((node) => (node.parent_id ?? null) !== parentId)) throw new AdminQuestoesError(422, "A reordenação só é permitida entre estruturas irmãs."); let siblingsRequest = db().from("law_structure").select("id").eq("lei_id", current.id).eq("ativo", true).order("ordem").order("id"); siblingsRequest = parentId === null ? siblingsRequest.is("parent_id", null) : siblingsRequest.eq("parent_id", parentId); const siblings = await siblingsRequest; if (siblings.error) fail("carregar_irmas", siblings.error); const siblingIds = (siblings.data ?? []).map((node) => node.id); if (siblingIds.length !== ids.length || siblingIds.some((siblingId) => !ids.includes(siblingId))) throw new AdminQuestoesError(422, "A ordem deve conter exatamente todas as estruturas irmãs."); for (const [index, structureId] of ids.entries()) { const updated = await db().from("law_structure").update({ ordem: index + 1 }).eq("id", structureId).eq("lei_id", current.id).eq("ativo", true); if (updated.error) fail("reordenar_estrutura", updated.error); } return { ids }; }
export async function deactivateStructureNode(body: Record<string, unknown>) { await requireAdmin(); const current = await law(String(body.law_slug)); const r = await db().from("law_structure").update({ ativo: false }).eq("id", id(body.id)).eq("lei_id", current.id).eq("ativo", true).select("id").maybeSingle(); if (r.error) fail("desativar_estrutura", r.error); if (!r.data) throw new AdminQuestoesError(404, "Estrutura ativa não encontrada."); return r.data; }
export async function structureDeletionSummary(body: Record<string, unknown>) { const user = await requireAdmin(); const current = await law(String(body.law_slug)); const structureId = id(body.id); const root = await db().from("law_structure").select("id,nome,tipo").eq("id", structureId).eq("lei_id", current.id).maybeSingle(); if (root.error) fail("resumo_estrutura", root.error); if (!root.data) throw new AdminQuestoesError(404, "Estrutura não encontrada."); const summary = await deleteContentRpc(current, user.id, null, structureId, false); return { ...summary, id: root.data.id, name: root.data.nome, type: root.data.tipo }; }
export async function deleteStructureNode(body: Record<string, unknown>) { const user = await requireAdmin(); const current = await law(String(body.law_slug)); if (body.confirmation !== "EXCLUIR") throw new AdminQuestoesError(400, "Digite EXCLUIR para confirmar a exclusão definitiva da estrutura e do conteúdo afetado."); return deleteContentRpc(current, user.id, null, id(body.id), true, body.confirmation, body.job_action); }

function structureTxt(value: unknown) {
  if (typeof value !== "string" || value.length > 500_000) throw new AdminQuestoesError(400, "O conteúdo TXT é inválido ou excede 500 KB.");
  return value;
}

async function buildStructureTxtImport(lawSlug: string, input: string) {
  const current = await law(lawSlug);
  const existing = await structure(current.id);
  const parsed = parseQuestionStructureTxt(input);
  const plan = planQuestionDeckStructure(parsed.rows, existing);
  const rowsByLine = new Map(parsed.rows.map((row) => [row.line, row]));
  const plannedByKey = new Map(plan.nodes.map((node) => [node.key, node]));
  const conflicts = [...parsed.issues];
  for (const deck of plan.decks) if (deck.error) conflicts.push({ line: deck.line, path: rowsByLine.get(deck.line)?.deck.slice(1).join("::") ?? "", message: deck.error });
  for (const node of plan.nodes) {
    if (node.existingId !== null) continue;
    const plannedParent = node.parentKey ? plannedByKey.get(node.parentKey) : null;
    if (plannedParent && plannedParent.existingId === null) continue;
    const parentId = plannedParent?.existingId ?? null;
    const conflict = existing.find((item) => item.parent_id === parentId && normalizeQuestionStructureName(item.nome) === normalizeQuestionStructureName(node.nome) && item.tipo !== node.tipo);
    if (conflict) conflicts.push({ line: parsed.rows.find((row) => row.deck.slice(1).map(normalizeQuestionStructureName).join(" › ").startsWith(node.path.split(" › ").map(normalizeQuestionStructureName).join(" › ")))?.line ?? 0, path: node.path, message: `Já existe “${conflict.nome}” neste nível com o tipo ${conflict.tipo}.` });
  }
  const firstLine = (path: string) => {
    const target = path.split(" › ").map(normalizeQuestionStructureName).join("\u0000");
    return parsed.rows.find((row) => row.deck.slice(1).slice(0, path.split(" › ").length).map(normalizeQuestionStructureName).join("\u0000") === target)?.line ?? 0;
  };
  const items = plan.nodes.map((node) => ({ key: node.key, parent_key: node.parentKey, line: firstLine(node.path), path: node.path, nome: node.nome, tipo: node.tipo, status: node.existingId === null ? "novo" as const : "existente" as const }));
  return { current, existing, plan, response: { law: { id: current.id, slug: current.slug, titulo: current.titulo }, items, conflicts, summary: { novos: items.filter((item) => item.status === "novo").length, existentes: items.filter((item) => item.status === "existente").length, conflitos: conflicts.length }, can_import: conflicts.length === 0 && items.some((item) => item.status === "novo") } };
}

export async function previewStructureTxtImport(body: Record<string, unknown>) {
  await requireAdmin();
  return (await buildStructureTxtImport(String(body.law_slug), structureTxt(body.text))).response;
}

export async function importStructureTxt(body: Record<string, unknown>) {
  await requireAdmin();
  const prepared = await buildStructureTxtImport(String(body.law_slug), structureTxt(body.text));
  if (prepared.response.conflicts.length) throw new AdminQuestoesError(422, `A importação possui ${prepared.response.conflicts.length} conflito(s). Revise a prévia antes de confirmar.`);
  const ids = new Map(prepared.plan.nodes.filter((node) => node.existingId !== null).map((node) => [node.key, node.existingId!]));
  const insertedIds: number[] = [];
  const nextOrder = new Map<number | null, number>();
  for (const node of prepared.existing) nextOrder.set(node.parent_id, Math.max(nextOrder.get(node.parent_id) ?? 0, Number(node.ordem) || 0));
  try {
    for (const node of prepared.plan.nodes) {
      if (ids.has(node.key)) continue;
      const parentId = node.parentKey ? ids.get(node.parentKey) : null;
      if (node.parentKey && !parentId) throw new AdminQuestoesError(422, `O pai de “${node.nome}” não pôde ser resolvido.`);
      const order = (nextOrder.get(parentId ?? null) ?? 0) + 1;
      const result = await db().from("law_structure").insert({ lei_id: prepared.current.id, parent_id: parentId ?? null, tipo: node.tipo, nome: node.nome, ordem: order, ativo: true }).select("id").single();
      if (result.error || !result.data) throw new Error("Falha ao persistir nó estrutural.");
      const createdId = Number(result.data.id); ids.set(node.key, createdId); insertedIds.push(createdId); nextOrder.set(parentId ?? null, order);
    }
  } catch (error) {
    const rollback = insertedIds.length ? await db().from("law_structure").delete().eq("lei_id", prepared.current.id).in("id", insertedIds) : null;
    if (rollback?.error) { console.error("Falha ao reverter importação de estrutura", { lawId: prepared.current.id, insertedIds, error: rollback.error }); throw new AdminQuestoesError(500, "A importação falhou e a reversão automática não foi concluída. Não tente novamente antes de revisar a estrutura."); }
    if (error instanceof AdminQuestoesError) throw error;
    throw new AdminQuestoesError(502, "A importação falhou e nenhuma alteração parcial foi mantida.");
  }
  return { law: prepared.response.law, criados: insertedIds.length, existentes: prepared.response.summary.existentes, conflitos: 0 };
}

function withSlug(rows: ImportedQuestion[], lawSlug: string) {
  return rows.map((row) => ({
    ...row,
    slug: effectiveAnkiSlug(row.slug, lawSlug),
    assunto: normalizeQuestionLegalReference(row.assunto),
    titulo: normalizeQuestionLegalReference(row.titulo),
  }));
}
function structureMappings(value: unknown): StructureImportMapping {
  if (value === undefined || value === null) return {};
  if (!value || Array.isArray(value) || typeof value !== "object") throw new AdminQuestoesError(400, "Mapeamento estrutural inválido.");
  const mappings: StructureImportMapping = {};
  for (const [key, selection] of Object.entries(value as Record<string, unknown>)) {
    if (!key || key.length > 2_000) throw new AdminQuestoesError(400, "Mapeamento estrutural inválido.");
    if (selection === "new") mappings[key] = "new";
    else if (Number.isSafeInteger(Number(selection)) && Number(selection) > 0) mappings[key] = Number(selection);
    else throw new AdminQuestoesError(400, "Destino estrutural inválido.");
  }
  return mappings;
}
function diagnostics(issues: ImportIssue[], items: Array<{ line: number; deck: string; ordem: string; pergunta: string; status: string; motivo: string | null; erro_field?: string }>) { return [...issues.map((issue) => ({ severity: "erro", line: issue.line, deck: issue.deck?.join("::") ?? "", ordem: issue.ordem ?? "", pergunta: issue.pergunta ?? "", field: issue.field ?? "arquivo", received: issue.received ?? "", expected: issue.expected ?? "", motivo: issue.message })), ...items.filter((item) => item.status === "erro").map((item) => ({ severity: "erro", line: item.line, deck: item.deck, ordem: item.ordem, pergunta: item.pergunta, field: item.erro_field ?? "estrutura", received: item.deck, expected: item.erro_field === "ordem" ? "Segmentos alfanuméricos separados por ponto" : "Deck/subdeck com níveis reconhecidos", motivo: item.motivo ?? "Estrutura inválida." }))]; }
export async function previewQuestionImport(lawSlug: string, parsed: { rows: ImportedQuestion[]; issues: ImportIssue[] }, mappings: StructureImportMapping = {}, apkg?: Record<string, unknown>) {
  const current = await law(lawSlug);
  const check = validateImportSlug(parsed.rows, current.slug);
  if (!check.valid) throw new AdminQuestoesError(422, check.message ?? "O arquivo não corresponde à legislação selecionada.");
  const rows = withSlug(parsed.rows, current.slug);
  const [existing, nodes] = await Promise.all([
    // Carregue tambem todos os campos que o APKG consegue transportar. A
    // comparacao anterior olhava apenas a fonte legislativa e, por isso,
    // deixava passar alteracoes de enunciado, gabarito e justificativa.
    collectPages(async (from, to) => {
      const page = await db().from("questions").select("id,pergunta,resposta,justificativa,slug,ordem,titulo,assunto,legislacao,total_artigos,ultima_alteracao_legislativa").eq("lei_id", current.id).eq("ativo", true).order("id").range(from, to);
      if (page.error) fail("previsualizar", page.error);
      return page.data ?? [];
    }, 500).then((data) => ({ data, error: null })),
    structure(current.id),
  ]);
  if (existing.error) fail("previsualizar", existing.error);
  const existingByPair = new Map<string, typeof existing.data>();
  const existingById = new Map<string, NonNullable<typeof existing.data>[number]>();
  for (const item of existing.data ?? []) {
    const key = importSourceKey(item as { slug: string; ordem: string });
    existingByPair.set(key, [...(existingByPair.get(key) ?? []), item]);
    existingById.set(String(item.id), item);
  }
  const idsFromFile = [...new Set(rows.map((row) => row.id_questao).filter((value): value is string => Boolean(value && /^[0-9a-f-]{36}$/i.test(value))))];
  // Nunca use slug/ordem ou enunciado como plano B para um UUID que veio no
  // arquivo. Consultar sem o filtro da lei permite distinguir UUID inexistente,
  // inativo e pertencente a outra lei, todos erros impeditivos.
  const identified = new Map<string, { id: string; lei_id: number; ativo: boolean }>();
  for (let start = 0; start < idsFromFile.length; start += 200) {
    const found = await db().from("questions").select("id,lei_id,ativo").in("id", idsFromFile.slice(start, start + 200));
    if (found.error) fail("validar_uuid_importacao", found.error);
    for (const item of found.data ?? []) identified.set(String(item.id), { id: String(item.id), lei_id: Number(item.lei_id), ativo: Boolean(item.ativo) });
  }
  const plan = planQuestionDeckStructure(rows, nodes, mappings);
  const decks = new Map(plan.decks.map((deck) => [deck.line, deck]));
  const items = rows.map((row) => {
    const deck = decks.get(row.line);
    const key = importSourceKey(row);
    const invalid = validateImportSource(row);
    const stored = apkg && !row.id_questao ? [] : existingByPair.get(key) ?? [];
    const uuidSupplied = Boolean(row.id_questao);
    const hasUuid = Boolean(row.id_questao && /^[0-9a-f-]{36}$/i.test(row.id_questao));
    const identifiedQuestion = hasUuid ? identified.get(row.id_questao!) : undefined;
    const uuidError = uuidSupplied && !hasUuid ? "IDQuestao inválido."
      : hasUuid && (!identifiedQuestion || identifiedQuestion.lei_id !== current.id || !identifiedQuestion.ativo)
        ? !identifiedQuestion ? "IDQuestao não existe." : identifiedQuestion.lei_id !== current.id ? "IDQuestao pertence a outra lei." : "IDQuestao refere-se a uma questão inativa."
        : null;
    // UUID identity deliberately ignores the incoming order: Ordem is one of
    // the editable APKG fields.  Do not fall back to source matching when an
    // IDQuestao exists, otherwise a changed order becomes a silent insert.
    // Mirror the RPC validation before offering confirmation.  In particular,
    // the legacy source validator only checks that Ordem is nonempty, while a
    // UUID update needs the stricter database-safe format.
    const repeatedUuid = apkg && row.id_questao && rows.filter((candidate) => candidate.id_questao === row.id_questao).length > 1;
    const baseReason = deck?.error ?? invalid ?? uuidError ?? (repeatedUuid ? "IDQuestao repetido no arquivo." : null);
    const initial = classifyApkgQuestion(row, stored, existingById, baseReason);
    const proposalError = apkg && hasUuid && !baseReason && initial.matching
      ? validateApkgUuidUpdateProposal(row, initial.matching.ordem)
      : null;
    const reason = baseReason ?? proposalError;
    const erroField = proposalError ? "ordem" : uuidError ? "id_questao" : invalid ? "fonte" : deck?.error ? "estrutura" : undefined;
    const { matching, status } = proposalError ? classifyApkgQuestion(row, stored, existingById, reason) : initial;
    return {
      line: row.line,
      deck: row.deck.join("::"),
      ordem: row.ordem,
      pergunta: row.pergunta,
      existing_id: matching?.id ?? null,
      // A confirmação segura recebe exatamente o estado visto na prévia.
      // Não use updated_at isoladamente: todos os campos importáveis precisam
      // continuar iguais para impedir que uma edição concorrente seja perdida.
      expected: matching ? { pergunta: matching.pergunta, resposta: matching.resposta, justificativa: matching.justificativa ?? null, titulo: matching.titulo ?? null, assunto: matching.assunto ?? null, legislacao: matching.legislacao ?? null, ordem: matching.ordem, total_artigos: matching.total_artigos ?? null, ultima_alteracao_legislativa: matching.ultima_alteracao_legislativa ?? null } : null,
      proposed: apkgQuestionProposal(row),
      status: status as ApkgPreviewStatus,
      motivo: reason,
      erro_field: erroField,
      duplicate_ids: [] as string[],
    };
  });
  if (apkg) {
    // Use the same root-law deck scope and HTML/space normalizer as the
    // existing duplicate-review tool. Answers never enter this grouping.
    const replacements = new Map(items.filter((item) => item.existing_id && item.status !== "erro").map((item) => [item.existing_id!, item.pergunta]));
    const candidates = [
      ...(existing.data ?? []).map((item) => ({ id: String(item.id), lei_id: current.id, pergunta: replacements.get(String(item.id)) ?? item.pergunta })),
      ...items.filter((item) => item.status === "nova").map((item) => ({ id: `import:${item.line}`, lei_id: current.id, pergunta: item.pergunta })),
    ];
    const duplicates = new Map<string, string[]>();
    for (const group of groupDuplicateQuestionStatements(candidates)) {
      for (const question of group.questions) duplicates.set(question.id, group.questions.filter((other) => other.id !== question.id).map((other) => other.id));
    }
    for (const item of items) {
      if (item.status === "erro") continue;
      item.duplicate_ids = duplicates.get(item.existing_id ?? `import:${item.line}`) ?? [];
      if (item.status === "nova" && item.duplicate_ids.length) {
        item.status = "nova_duplicada";
        item.motivo = "Nova questão repetida: fora da importação. Revise a assertiva no mesmo baralho.";
      }
    }
  }
  const replacementById = new Map<string, ImportedQuestion>();
  const incomingWithoutMatch: ImportedQuestion[] = [];
  const itemByLine = new Map(items.map((item) => [item.line, item]));
  for (const row of rows) {
    const item = itemByLine.get(row.line);
    if (!item || item.status === "erro" || item.status === "nova_duplicada") continue;
    if (item.existing_id) replacementById.set(item.existing_id, row);
    else incomingWithoutMatch.push(row);
  }
  const asSource = (value: { slug: string; ordem: string; titulo?: string | null; assunto?: string | null; legislacao?: string | null }): ImportSourceFields => ({
    slug: value.slug,
    ordem: value.ordem,
    titulo: value.titulo ?? "",
    assunto: value.assunto ?? "",
    legislacao: value.legislacao ?? "",
  });
  const effectiveSources = (existing.data ?? []).map((stored) => asSource(replacementById.get(stored.id) ?? stored));
  effectiveSources.push(...incomingWithoutMatch.map(asSource));
  const warnings = groupImportSourceWarnings(effectiveSources);
  // UUID updates preserve structure_id; excluded notes create no structures.
  // Only selected new APKG notes need destination review or structure creation.
  const destinationPlan = apkg ? planQuestionDeckStructure(rows.filter((row) => itemByLine.get(row.line)?.status === "nova"), nodes, mappings) : plan;
  // TXT conserva seu fluxo histórico. A separação é obrigatória apenas para
  // APKG, cuja atualização por IDQuestao passa pela RPC transacional.
  const hasMixedUuidBatch = Boolean(apkg) && hasMixedApkgBatch(items.map((item) => item.status));
  const errors = [...diagnostics(parsed.issues, items), ...destinationPlan.nodes.filter((node) => node.mappingError).map((node) => ({ severity: "erro", line: 0, deck: node.path, ordem: "", pergunta: "", field: "mapeamento", received: node.path, expected: "Destino sugerido do mesmo caminho", motivo: node.mappingError! })), ...(hasMixedUuidBatch ? [{ severity: "erro", line: 0, deck: "", ordem: "", pergunta: "", field: "lote", received: "Questões novas e atualizações por UUID", expected: "Importe primeiro as atualizações por UUID e depois as novas questões", motivo: "Lote misto bloqueado para preservar a atualização transacional por UUID." }] : [])];
  const structurePreview = destinationPlan.nodes.map((node) => ({ key: node.key, path: node.path, tipo: node.tipo, status: node.mappingError ? "erro" as const : node.requiresMapping ? "revisao" as const : node.existingId === null ? "nova" as const : "existente" as const, destination_id: node.existingId, candidates: node.candidates }));
  return { law: current, slug: check, total: rows.length, issues: parsed.issues, errors, warnings, items, structure: { items: structurePreview, existentes: structurePreview.filter((node) => node.status === "existente").length, novas: structurePreview.filter((node) => node.status === "nova").length, revisoes: structurePreview.filter((node) => node.status === "revisao").length }, summary: { novas: items.filter((item) => item.status === "nova").length, atualizadas: items.filter((item) => item.status === "atualizada").length, duplicadas: items.filter((item) => item.status === "duplicada").length, conflitos: warnings.filter((warning) => warning.kind === "legislacao" || warning.kind === "estrutural").length, avisos: warnings.length, erros: errors.length }, ...(apkg ? { apkg } : {}) };
}
export async function previewAnkiImport(body: Record<string, unknown>) { await requireAdmin(); if (typeof body.text !== "string" || body.text.length > 20_000_000) throw new AdminQuestoesError(400, "Arquivo TXT inválido ou grande demais."); try { return previewQuestionImport(slug(body.law_slug), parseAnkiTxt(body.text), structureMappings(body.structure_mappings)); } catch (error) { if (error instanceof AdminQuestoesError) throw error; throw new AdminQuestoesError(400, error instanceof Error ? error.message : "TXT inválido."); } }
function apkgPreviewToken(data: Awaited<ReturnType<typeof previewQuestionImport>>, rows: ImportedQuestion[]) {
  // Vincula a confirmação tanto ao snapshot do banco quanto ao conteúdo
  // proposto. Assim, trocar o arquivo depois da prévia também a invalida.
  return createHash("sha256").update(JSON.stringify({
    structure: data.structure,
    items: data.items.map((item) => ({ line: item.line, id: item.existing_id, expected: item.expected, status: item.status, duplicate_ids: item.duplicate_ids })),
    rows: rows.map(({ line, deck, id_questao, pergunta, resposta, justificativa, assunto, legislacao, ordem, titulo, total_artigos, slug, ultima_alteracao_legislativa }) => ({ line, deck, id_questao, pergunta, resposta, justificativa, assunto, legislacao, ordem, titulo, total_artigos, slug, ultima_alteracao_legislativa })),
  })).digest("hex");
}
export async function previewApkgImport(lawSlug: unknown, file: File, mappings: unknown = {}) {
  await requireAdmin();
  if (!file.name.toLowerCase().endsWith(".apkg") || !file.size || file.size > 100_000_000) throw new AdminQuestoesError(400, "Arquivo APKG inválido ou grande demais.");
  let parsed; try { parsed = await parseLegisApkg(new Uint8Array(await file.arrayBuffer())); } catch (error) { throw new AdminQuestoesError(400, error instanceof Error ? error.message : "APKG inválido."); }
  if (parsed.media.some((media) => media.referenced)) throw new AdminQuestoesError(422, "O APKG possui mídia referenciada. O suporte a mídia ainda não faz parte desta etapa.");
  const data = await previewQuestionImport(slug(lawSlug), { rows: parsed.rows, issues: parsed.issues }, structureMappings(mappings), { rootDecks: parsed.rootDecks ?? [], subdecks: parsed.subdecks ?? [], notes: parsed.notes ?? 0, cards: parsed.cards ?? 0, recognizedModels: parsed.recognizedModels ?? [], unrecognizedModels: parsed.unrecognizedModels ?? [], media: parsed.media ?? [], samples: parsed.rows.slice(0, 5) });
  return { ...data, preview_token: apkgPreviewToken(data, parsed.rows) };
}
async function markImportConflictsForReview(warnings: Array<{ kind: string; slug: string; ordem: string }>) {
  for (const warning of warnings.filter((item) => item.kind === "legislacao" || item.kind === "estrutural")) {
    const review = await db().from("legisbot_comentarios").update({ precisa_revisao: true }).eq("slug", warning.slug).eq("ordem", warning.ordem);
    if (review.error) fail("sinalizar_conflito_importacao", review.error);
  }
}
async function rejectImportedDuplicateStatements(leiId: number, rows: ImportedQuestion[], previewByLine: Map<number, { existing_id: string | null; status: string }>) {
  const stored = await db().from("questions").select("id,lei_id,pergunta").eq("lei_id", leiId).eq("ativo", true);
  if (stored.error) fail("validar_duplicidade_importacao", stored.error);
  const incoming = rows.filter((row) => ["nova", "atualizada"].includes(previewByLine.get(row.line)?.status ?? ""));
  const replacements = new Map(incoming.flatMap((row) => {
    const existingId = previewByLine.get(row.line)?.existing_id;
    return existingId ? [[existingId, row.pergunta] as const] : [];
  }));
  const candidates = [
    ...(stored.data ?? []).map((question) => ({ id: String(question.id), lei_id: Number(question.lei_id), pergunta: replacements.get(String(question.id)) ?? String(question.pergunta) })),
    ...incoming.filter((row) => !previewByLine.get(row.line)?.existing_id).map((row) => ({ id: `import:${row.line}`, lei_id: leiId, pergunta: row.pergunta })),
  ];
  const incomingIds = new Set(incoming.map((row) => previewByLine.get(row.line)?.existing_id ?? `import:${row.line}`));
  const before = (stored.data ?? []).map((question) => ({ id: String(question.id), lei_id: Number(question.lei_id), pergunta: String(question.pergunta) }));
  if (introducedDuplicateQuestionStatementIds(before, candidates, incomingIds).size) {
    throw new AdminQuestoesError(409, "A importação criaria uma questão ativa com o mesmo enunciado nesta lei.");
  }
}
async function persist(lawSlug: string, rows: ImportedQuestion[], previewData: Awaited<ReturnType<typeof previewQuestionImport>>, mappings: StructureImportMapping, ignored = 0, secureUuidUpdates = false, expectedPreviewToken?: unknown) {
  if (!previewData.slug.valid || previewData.errors.length || previewData.structure.revisoes) throw new AdminQuestoesError(422, "A importação possui linhas inválidas ou destinos estruturais ainda não revisados.");
  const current = await law(lawSlug);
  const normalizedRows = withSlug(rows, current.slug);
  const previewByLine = new Map(previewData.items.map((item) => [item.line, item]));
  const statusByLine = new Map(previewData.items.map((item) => [item.line, item.status]));
  const newRows = normalizedRows.filter((row) => statusByLine.get(row.line) === "nova");
  const updatedRows = normalizedRows.filter((row) => statusByLine.get(row.line) === "atualizada");
  if (secureUuidUpdates && (typeof expectedPreviewToken !== "string" || expectedPreviewToken !== apkgPreviewToken(previewData, rows))) throw new AdminQuestoesError(409, "A prévia mudou desde a confirmação. Analise o APKG novamente antes de importar.");
  if (secureUuidUpdates && newRows.length && updatedRows.length) throw new AdminQuestoesError(422, "Para manter a transação segura, importe primeiro as atualizações por UUID e depois as novas questões.");
  // APKG duplicates were classified in the freshly regenerated, token-bound
  // preview. UUID updates remain transactional; excluded new rows never insert.
  if (!secureUuidUpdates) await rejectImportedDuplicateStatements(current.id, normalizedRows, previewByLine);
  if (secureUuidUpdates && updatedRows.length) {
    if (updatedRows.some((row) => !row.id_questao)) throw new AdminQuestoesError(422, "APKG com atualizações exige IDQuestao em todas as questões alteradas.");
    const user = await requireAdmin();
    const updates = updatedRows.map((row) => {
      const item = previewByLine.get(row.line) as { existing_id: string | null; expected: Record<string, unknown> | null } | undefined;
      if (!item?.existing_id || !item.expected) throw new AdminQuestoesError(409, "A prévia da questão não está mais disponível. Gere uma nova prévia.");
      return { id: item.existing_id, expected: item.expected, proposed: { pergunta: row.pergunta, resposta: row.resposta, justificativa: row.justificativa || null, titulo: row.titulo || null, assunto: row.assunto || null, legislacao: row.legislacao || null, ordem: row.ordem, total_artigos: /^\d+$/.test(row.total_artigos) ? Number(row.total_artigos) : null, ultima_alteracao_legislativa: row.ultima_alteracao_legislativa || null } };
    });
    const reviewConflicts = previewData.warnings.filter((warning) => warning.kind === "legislacao" || warning.kind === "estrutural").map((warning) => ({ slug: warning.slug, ordem: warning.ordem, kind: warning.kind }));
    const applied = await db().rpc("admin_apply_apkg_uuid_question_updates", { p_lei_id: current.id, p_updates: updates, p_review_conflicts: reviewConflicts, p_actor_user_id: user.id });
    if (applied.error) {
      if (applied.error.code === "PGRST202" || applied.error.code === "42883") throw new AdminQuestoesError(503, "Atualização segura de APKG indisponível: aplique a migration 20261027120000_add_safe_apkg_uuid_question_updates.sql.");
      throw new AdminQuestoesError(applied.error.code === "40001" ? 409 : 422, applied.error.message);
    }
  }
  for (const row of updatedRows) {
    if (secureUuidUpdates) continue;
    const existingId = previewByLine.get(row.line)?.existing_id;
    if (!existingId) throw new AdminQuestoesError(422, "A questão que seria atualizada não pôde ser identificada com segurança.");
    const questionUpdate = await db().from("questions").update({ titulo: row.titulo, assunto: row.assunto, legislacao: row.legislacao, pergunta: row.pergunta, resposta: row.resposta, justificativa: row.justificativa || null, total_artigos: /^\d+$/.test(row.total_artigos) ? Number(row.total_artigos) : null, ultima_alteracao_legislativa: row.ultima_alteracao_legislativa || null }).eq("id", existingId).eq("lei_id", current.id).eq("ativo", true);
    if (questionUpdate.error) fail("atualizar_questao_importada", questionUpdate.error);
    const review = await db().from("legisbot_comentarios").update({ precisa_revisao: true }).eq("slug", row.slug.toUpperCase()).eq("ordem", row.ordem);
    if (review.error) fail("sinalizar_revisao_legisbot", review.error);
  }
  if (!newRows.length) {
    if (!secureUuidUpdates) await markImportConflictsForReview(previewData.warnings);
    return { lidas: rows.length, importadas: 0, atualizadas: updatedRows.length, duplicadas: previewData.summary.duplicadas, novas_duplicadas: previewData.items.filter((item) => item.status === "nova_duplicada").length, ignoradas: ignored, conflitos: previewData.summary.conflitos, avisos: previewData.warnings, erros: 0, estruturas_criadas: 0, estruturas_reutilizadas: (await structure(current.id)).length };
  }
  const before = await structure(current.id);
  const plan = planQuestionDeckStructure(newRows, before, mappings);
  const ids = new Map(plan.nodes.filter((node) => node.existingId !== null).map((node) => [node.key, node.existingId!]));
  const nextOrder = new Map<number | null, number>();
  for (const node of before) nextOrder.set(node.parent_id, Math.max(nextOrder.get(node.parent_id) ?? 0, Number(node.ordem) || 0));
  for (const node of plan.nodes) if (!ids.has(node.key)) { const parentId = node.parentKey ? ids.get(node.parentKey) : null; if (node.parentKey && !parentId) throw new AdminQuestoesError(422, "Estrutura pai não pôde ser criada."); const order = (nextOrder.get(parentId ?? null) ?? 0) + 1; const r = await db().from("law_structure").insert({ lei_id: current.id, parent_id: parentId ?? null, tipo: node.tipo, nome: node.nome, ordem: order, ativo: true }).select("id").single(); if (r.error || !r.data) fail("criar_estrutura_importacao", r.error); ids.set(node.key, r.data.id); nextOrder.set(parentId ?? null, order); }
  const byLine = new Map(plan.decks.map((deck) => [deck.line, deck.structureKey ? ids.get(deck.structureKey) ?? null : null]));
  const inserted = await db().from("questions").insert(newRows.map((row) => ({ lei_id: current.id, structure_id: byLine.get(row.line) ?? null, pergunta: row.pergunta, resposta: row.resposta, justificativa: row.justificativa || null, assunto: row.assunto || null, legislacao: row.legislacao || null, ordem: row.ordem, titulo: row.titulo || null, total_artigos: /^\d+$/.test(row.total_artigos) ? Number(row.total_artigos) : null, slug: row.slug, ultima_alteracao_legislativa: row.ultima_alteracao_legislativa || null, ativo: true }))).select("id");
  if (inserted.error) fail("importar_anki", inserted.error);
  if (!secureUuidUpdates) await markImportConflictsForReview(previewData.warnings);
  return { lidas: rows.length, importadas: inserted.data?.length ?? 0, atualizadas: updatedRows.length, duplicadas: previewData.summary.duplicadas, novas_duplicadas: previewData.items.filter((item) => item.status === "nova_duplicada").length, ignoradas: ignored, conflitos: previewData.summary.conflitos, avisos: previewData.warnings, erros: 0, estruturas_criadas: plan.nodes.filter((node) => node.existingId === null).length, estruturas_reutilizadas: plan.nodes.filter((node) => node.existingId !== null).length };
}
export async function importAnkiTxt(body: Record<string, unknown>) { await requireAdmin(); const parsed = parseAnkiTxt(String(body.text)); const mappings = structureMappings(body.structure_mappings); const data = await previewQuestionImport(slug(body.law_slug), parsed, mappings); return persist(slug(body.law_slug), parsed.rows, data, mappings); }
export async function importApkg(body: { lawSlug: unknown; file: File; structureMappings?: unknown; previewToken?: unknown }) { await requireAdmin(); const parsed = await parseLegisApkg(new Uint8Array(await body.file.arrayBuffer())); const mappings = structureMappings(body.structureMappings); const data = await previewApkgImport(body.lawSlug, body.file, mappings); return persist(slug(body.lawSlug), parsed.rows, data, mappings, parsed.unrecognizedModels.reduce((sum, model) => sum + model.notes, 0), true, body.previewToken); }

type ReparentPreview = { node: ReparentStructureNode; currentPath: string[]; newPath: string[]; expected: { parent_id: number | null; ordem: number; updated_at: string } };
async function resolveStructureReparenting(body: Record<string, unknown>): Promise<{ current: Law; user: Awaited<ReturnType<typeof requireAdmin>>; preview: ReparentPreview; newParentId: number | null }> {
  const user = await requireAdmin(); const current = await law(String(body.law_slug)); if (!("new_parent_id" in body)) throw new AdminQuestoesError(400, "Informe a estrutura superior de destino.");
  const newParentId = body.new_parent_id === null ? null : id(body.new_parent_id); const nodes = await structure(current.id) as unknown as ReparentStructureNode[]; const nodeId = id(body.id);
  try { const { node } = validateStructureReparenting(nodes, nodeId, newParentId); const expected = { parent_id: node.parent_id, ordem: node.ordem, updated_at: node.updated_at ?? "" }; if (!expected.updated_at) throw new AdminQuestoesError(409, "A estrutura não possui versão para conferência. Recarregue a página."); return { current, user, newParentId, preview: { node, currentPath: structurePath(nodeId, nodes), newPath: [...(newParentId === null ? [] : structurePath(newParentId, nodes)), node.nome], expected } }; }
  catch (error) { if (error instanceof AdminQuestoesError) throw error; throw new AdminQuestoesError(422, error instanceof Error ? error.message : "Não foi possível validar a nova estrutura superior."); }
}
export async function previewStructureReparenting(body: Record<string, unknown>) { const resolved = await resolveStructureReparenting(body); return { id: resolved.preview.node.id, nome: resolved.preview.node.nome, current_path: resolved.preview.currentPath, new_path: resolved.preview.newPath, ordem: resolved.preview.node.ordem, expected: resolved.preview.expected }; }
export async function reparentStructureNode(body: Record<string, unknown>) { const resolved = await resolveStructureReparenting(body); const expected = reparentExpected(body.expected); const currentExpected = resolved.preview.expected; if (expected.parent_id !== currentExpected.parent_id || expected.ordem !== currentExpected.ordem || expected.updated_at !== currentExpected.updated_at) throw new AdminQuestoesError(409, "A estrutura mudou desde a prévia. Gere uma nova prévia antes de confirmar."); const result = await db().rpc("admin_reparent_law_structure", { p_actor_user_id: resolved.user.id, p_lei_id: resolved.current.id, p_structure_id: resolved.preview.node.id, p_new_parent_id: resolved.newParentId, p_expected_parent_id: expected.parent_id, p_expected_ordem: expected.ordem, p_expected_updated_at: expected.updated_at }); if (result.error) { if (result.error.code === "PGRST202" || result.error.code === "42883") throw new AdminQuestoesError(503, "A movimentação segura de estrutura ainda não está disponível. Aplique a migration 20261022140000_add_admin_reparent_law_structure.sql."); throw new AdminQuestoesError(result.error.code === "40001" ? 409 : result.error.code === "42501" ? 403 : 422, result.error.message); } if (!result.data) throw new AdminQuestoesError(502, "A movimentação segura não retornou a estrutura atualizada."); return result.data; }
