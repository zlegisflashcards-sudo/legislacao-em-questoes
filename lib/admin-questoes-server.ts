import "server-only";
import { obterAdministrador } from "@/lib/admin-auth";
import { parseQuestionDraft, type QuestionDraft } from "@/lib/admin-questoes";
import { parseBulkQuestionEdit, type BulkQuestionEditScope } from "@/lib/admin-question-bulk-edit";
import { effectiveAnkiSlug, parseAnkiTxt, validateImportSlug } from "@/lib/anki-txt-import";
import { parseLegisApkg } from "@/lib/anki-apkg-import";
import type { ImportedQuestion, ImportIssue } from "@/lib/imported-question";
import { compareQuestionStructureNames, creatableQuestionStructureTypes, normalizeQuestionStructureName, parseQuestionStructureTxt, planQuestionDeckStructure, validQuestionStructureParent, type CreatableQuestionStructureType, type QuestionStructureNode, type QuestionStructureType, type StructureImportMapping } from "@/lib/questoes-structure";
import { getSupabaseServerClient } from "@/lib/supabase-server";
import { summarizeLawQuestionScopes } from "@/lib/law-question-scope-resolution";
import { ADMIN_QUESTION_SEARCH_LIMIT, ADMIN_QUESTION_SEARCH_MAX_LIMIT, adminQuestionSearchId, adminQuestionSearchTerms, parseAdminQuestionSearchFilter, plainQuestionText } from "@/lib/admin-question-search";
import { descendantStructureIds, sameImportIdentity } from "@/lib/admin-question-management";
import { groupImportSourceWarnings, importSourceKey, normalizedImportSource, validateImportSource, type ImportSourceFields } from "@/lib/legisbot/import-source";
import { getArticleContext } from "@/lib/admin-article-center-server";

export class AdminQuestoesError extends Error { constructor(public status: number, message: string) { super(message); } }
type StructureType = CreatableQuestionStructureType;
type Law = { id: number; slug: string; titulo: string; nome_curto: string | null; codigo: string | null };
const types: StructureType[] = creatableQuestionStructureTypes;
const questionFields = "id,lei_id,structure_id,pergunta,resposta,justificativa,assunto,legislacao,ordem,titulo,total_artigos,slug,ultima_alteracao_legislativa,capitulo,secao,subsecao,artigo,ativo,created_at,updated_at";
const db = () => getSupabaseServerClient();
async function requireAdmin() { const user = await obterAdministrador(); if (!user) throw new AdminQuestoesError(401, "Autenticação administrativa obrigatória."); return user; }
function fail(context: string, error: { code?: string; message?: string; details?: unknown; hint?: string } | null): never { console.error("Falha na administração de questões", { context, code: error?.code ?? null, message: error?.message ?? null, details: error?.details ?? null, hint: error?.hint ?? null }); throw new AdminQuestoesError(502, "Não foi possível concluir a operação no banco de questões."); }
function slug(value: unknown) { if (typeof value !== "string" || !/^[a-z0-9-]{1,160}$/.test(value)) throw new AdminQuestoesError(400, "Lei inválida."); return value; }
function id(value: unknown) { if (!Number.isSafeInteger(Number(value)) || Number(value) < 1) throw new AdminQuestoesError(400, "Estrutura inválida."); return Number(value); }
function qid(value: unknown) { if (typeof value !== "string" || !/^[0-9a-f-]{36}$/i.test(value)) throw new AdminQuestoesError(400, "Questão inválida."); return value; }
function text(value: unknown, label: string) { if (typeof value !== "string" || !value.trim() || value.trim().length > 500) throw new AdminQuestoesError(400, `${label} inválido.`); return value.trim(); }
function type(value: unknown) { if (!types.includes(value as StructureType)) throw new AdminQuestoesError(400, "Tipo estrutural inválido."); return value as StructureType; }
function optionalId(value: unknown) { return value === null || value === undefined || value === "" ? null : id(value); }
function structureOrder(value: unknown) { if (!Number.isSafeInteger(Number(value)) || Number(value) < 0) throw new AdminQuestoesError(400, "Posição estrutural inválida."); return Number(value); }
function draft(value: unknown) { try { return parseQuestionDraft(value as Record<string, unknown>); } catch (error) { throw new AdminQuestoesError(400, error instanceof Error ? error.message : "Dados da questão inválidos."); } }
async function law(lawSlug: string): Promise<Law> { const r = await db().from("leis").select("id,slug,titulo,nome_curto,codigo").eq("slug", slug(lawSlug)).eq("ativo", true).maybeSingle(); if (r.error) fail("carregar_lei", r.error); if (!r.data) throw new AdminQuestoesError(404, "Lei ativa não encontrada no banco principal."); return r.data as Law; }
async function structure(leiId: number) { const r = await db().from("law_structure").select("id,lei_id,parent_id,tipo,nome,ordem,pdf_page,ativo,created_at,updated_at").eq("lei_id", leiId).eq("ativo", true).order("ordem").order("id"); if (r.error) fail("listar_estrutura", r.error); return [...(r.data ?? [])].sort(compareQuestionStructureNames) as QuestionStructureNode[]; }
async function validateStructure(leiId: number, structureId: number | null) { if (!structureId) return; const r = await db().from("law_structure").select("id").eq("id", structureId).eq("lei_id", leiId).eq("ativo", true).maybeSingle(); if (r.error) fail("validar_estrutura", r.error); if (!r.data) throw new AdminQuestoesError(422, "A estrutura selecionada não pertence à lei ativa."); }
function values(law: Law, d: QuestionDraft) { return { lei_id: law.id, structure_id: d.structure_id, pergunta: d.pergunta, resposta: d.resposta, justificativa: d.justificativa, assunto: d.assunto, legislacao: d.legislacao, ordem: d.ordem, titulo: d.titulo, total_artigos: d.total_artigos, slug: law.slug, capitulo: d.capitulo, secao: d.secao, subsecao: d.subsecao, artigo: d.artigo }; }
async function rejectDuplicateQuestion(leiId: number, d: QuestionDraft, exceptId?: string) { let request = db().from("questions").select("id,ordem,pergunta").eq("lei_id", leiId).eq("ativo", true).eq("ordem", d.ordem).eq("pergunta", d.pergunta); if (exceptId) request = request.neq("id", exceptId); const result = await request.limit(1); if (result.error) fail("validar_duplicidade", result.error); if ((result.data ?? []).some((item) => sameImportIdentity(item, d))) throw new AdminQuestoesError(409, "Já existe uma questão ativa com a mesma ordem e enunciado nesta lei."); }

export async function listAdminQuestionLaws() { await requireAdmin(); const r = await db().from("leis").select("id,slug,titulo,nome_curto,codigo").eq("ativo", true).order("ordem").order("titulo"); if (r.error) fail("listar_leis", r.error); return r.data ?? []; }
export async function listLawQuestionScopes(lawSlug: string) { await requireAdmin(); const current = await law(lawSlug); const [scopes, nodes, questions, links] = await Promise.all([db().from("recortes_leis").select("id,nome,descricao,ativo,status_publicacao,acesso_gratuito,created_at,updated_at").eq("lei_id", current.id).order("nome"), structure(current.id), db().from("questions").select("id,structure_id").eq("lei_id", current.id).eq("ativo", true), db().from("recortes_leis_estrutura").select("recorte_id,structure_id").eq("lei_id", current.id)]); if (scopes.error) fail("listar_recortes", scopes.error); if (questions.error) fail("contar_recortes", questions.error); if (links.error) fail("listar_estruturas_recortes", links.error); const scopeRows = scopes.data ?? []; const questionRows = questions.data ?? []; return { law: current, structure: nodes, questions: questionRows, unstructured_questions: questionRows.filter((question) => question.structure_id === null).length, recortes: summarizeLawQuestionScopes(scopeRows, links.data ?? [], nodes, questionRows) }; }
export async function saveLawQuestionScope(body: Record<string, unknown>) { await requireAdmin(); const current = await law(String(body.law_slug)); const name = text(body.nome, "Nome do recorte"); const description = typeof body.descricao === "string" ? body.descricao.trim() : ""; const ids = Array.isArray(body.structure_ids) ? body.structure_ids.map(Number).filter((item) => Number.isSafeInteger(item) && item > 0) : []; const suppliedId = typeof body.id === "string" && /^[0-9a-f-]{36}$/i.test(body.id) ? body.id : null; const status = body.status_publicacao === "em_breve" || body.status_publicacao === "inativa" ? body.status_publicacao : "ativa"; const free = body.acesso_gratuito === true; const result = await db().rpc("admin_salvar_recorte_lei", { p_recorte_id: suppliedId, p_lei_id: current.id, p_nome: name, p_descricao: description, p_ativo: status !== "inativa", p_status_publicacao: status, p_acesso_gratuito: free, p_structure_ids: ids }); if (result.error || !result.data) fail("salvar_recorte", result.error); return { id: result.data, lei_id: current.id, nome: name, descricao: description, status_publicacao: status, acesso_gratuito: free, structure_ids: ids }; }
export async function listQuestionContent(lawSlug: string) { const current = await law(lawSlug); const r = await db().from("questions").select(questionFields).eq("lei_id", current.id).eq("ativo", true).order("ordem").order("created_at").order("id"); if (r.error) fail("listar_questoes", r.error); return { law: current, questions: r.data ?? [], structure: await structure(current.id) }; }
export async function listAdminQuestions(lawSlug: string) { await requireAdmin(); return listQuestionContent(lawSlug); }
export async function searchAdminQuestions(input: { lawSlug: string; query?: unknown; filter?: unknown; page?: unknown; limit?: unknown; structureId?: unknown; article?: unknown }) {
  await requireAdmin(); const current = await law(input.lawSlug); const questionId = adminQuestionSearchId(input.query); const terms = adminQuestionSearchTerms(input.query); const filter = parseAdminQuestionSearchFilter(input.filter); const page = Math.max(1, Number.isSafeInteger(Number(input.page)) ? Number(input.page) : 1); const requestedLimit = Number(input.limit); const limit = Number.isSafeInteger(requestedLimit) ? Math.min(ADMIN_QUESTION_SEARCH_MAX_LIMIT, Math.max(1, requestedLimit)) : ADMIN_QUESTION_SEARCH_LIMIT; const offset = (page - 1) * limit; const nodes = await structure(current.id); const structureId = input.structureId ? id(input.structureId) : null; const structureIds = structureId ? descendantStructureIds(nodes, structureId) : [];
  let request = db().from("questions").select("id,structure_id,pergunta,resposta,artigo,assunto,ordem,ativo,updated_at", { count: "exact" }).eq("lei_id", current.id).eq("ativo", true);
  if (questionId) request = request.eq("id", questionId);
  if (filter === "certo") request = request.eq("resposta", "Certo"); else if (filter === "errado") request = request.eq("resposta", "Errado"); else if (filter === "unstructured") request = request.is("structure_id", null);
  if (structureIds.length) request = request.in("structure_id", structureIds);
  if (typeof input.article === "string" && input.article.trim()) request = request.ilike("artigo", `%${input.article.trim().slice(0, 80)}%`);
  if (!questionId) for (const term of terms) { const matchingStructures = nodes.filter((node) => `${node.nome}`.toLocaleLowerCase("pt-BR").includes(term.toLocaleLowerCase("pt-BR"))).map((node) => node.id); const predicates = ["pergunta", "justificativa", "artigo", "assunto", "legislacao", "ordem", "titulo", "capitulo", "secao", "subsecao"].map((field) => `${field}.ilike.%${term}%`); if (matchingStructures.length) predicates.push(`structure_id.in.(${matchingStructures.join(",")})`); request = request.or(predicates.join(",")); }
  request = terms.length || questionId ? request.order("ordem").order("id") : request.order("updated_at", { ascending: false }).order("id");
  const result = await request.range(offset, offset + limit - 1); if (result.error) fail("pesquisar_questoes", result.error); const total = result.count ?? 0;
  return { law: current, results: (result.data ?? []).map((question) => ({ ...question, pergunta_trecho: plainQuestionText(question.pergunta), pergunta: undefined })), total, page, limit, pages: Math.max(1, Math.ceil(total / limit)), query: terms.join(" "), filter, structure_id: structureId };
}
export async function listAdminQuestionConference(lawSlug: string, structureId: unknown) {
  await requireAdmin();
  const current = await law(lawSlug);
  const rootId = id(structureId);
  const nodes = await structure(current.id);
  const ids = descendantStructureIds(nodes, rootId);
  if (!ids.length) throw new AdminQuestoesError(404, "Bloco estrutural não encontrado para esta lei.");
  const root = nodes.find((node) => node.id === rootId);
  if (!root) throw new AdminQuestoesError(404, "Bloco estrutural não encontrado para esta lei.");
  const result = await db().from("questions").select(questionFields).eq("lei_id", current.id).eq("ativo", true).in("structure_id", ids).order("ordem").order("id");
  if (result.error) fail("listar_questoes_conferencia", result.error);
  return { law: current, block: { id: root.id, nome: root.nome }, questions: result.data ?? [] };
}
export async function getAdminQuestionStructureReviews(lawSlug: string) {
  await requireAdmin();
  const current = await law(lawSlug);
  const result = await db().from("admin_question_structure_reviews").select("structure_id").eq("lei_id", current.id);
  if (result.error) fail("carregar_revisoes_estruturais", result.error);
  return { reviewed: (result.data ?? []).map((row) => Number(row.structure_id)).filter((value) => Number.isSafeInteger(value)) };
}
export async function setAdminQuestionStructureReview(body: Record<string, unknown>) {
  const admin = await obterAdministrador();
  if (!admin) throw new AdminQuestoesError(401, "Autenticação administrativa obrigatória.");
  const current = await law(String(body.law_slug));
  const structureId = id(body.structure_id);
  await validateStructure(current.id, structureId);
  if (typeof body.reviewed !== "boolean") throw new AdminQuestoesError(400, "Marcação de revisão inválida.");
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
  if (!context.trusted) return { status: "conflict" as const, href: null };
  return { status: "found" as const, href: `/admin/artigos/${encodeURIComponent(current.slug.toLowerCase())}/${encodeURIComponent(context.ordem)}?aba=artigo&lei=${encodeURIComponent(current.slug.toLowerCase())}` };
}
type ConferenceBatchInput = { pergunta?: unknown; resposta?: unknown; justificativa?: unknown; assunto?: unknown; ordem?: unknown; legislacao?: unknown };
function conferenceBatchDrafts(current: Law, structureId: unknown, rows: unknown) {
  const target = id(structureId);
  const values = Array.isArray(rows) ? rows : [];
  if (!values.length || values.length > 200) throw new AdminQuestoesError(400, "Informe entre 1 e 200 questões para adicionar.");
  return { target, drafts: values.map((row, index) => {
    try { return draft({ ...(row as ConferenceBatchInput), structure_id: target, titulo: "", total_artigos: null, capitulo: "", secao: "", subsecao: "", artigo: "" }); }
    catch (error) { throw new AdminQuestoesError(422, `Linha ${index + 1}: ${error instanceof Error ? error.message : "dados inválidos."}`); }
  }) };
}
async function validateConferenceBatch(current: Law, structureId: unknown, rows: unknown) {
  const { target, drafts } = conferenceBatchDrafts(current, structureId, rows);
  await validateStructure(current.id, target);
  const local = new Set<string>();
  for (const item of drafts) { const key = `${item.ordem}\u0000${item.pergunta.trim()}`; if (local.has(key)) throw new AdminQuestoesError(409, "A tabela possui linhas duplicadas com a mesma ordem e enunciado."); local.add(key); }
  const existing = await db().from("questions").select("ordem,pergunta").eq("lei_id", current.id).eq("ativo", true);
  if (existing.error) fail("validar_lote_conferencia", existing.error);
  for (const item of drafts) if ((existing.data ?? []).some((stored) => sameImportIdentity(stored, item))) throw new AdminQuestoesError(409, `Já existe uma questão com a ordem ${item.ordem} e o mesmo enunciado nesta lei.`);
  return { target, drafts };
}
export async function previewConferenceQuestionBatch(body: Record<string, unknown>) { await requireAdmin(); const current = await law(String(body.law_slug)); const { drafts } = await validateConferenceBatch(current, body.structure_id, body.rows); return { count: drafts.length, rows: drafts.map((item, index) => ({ line: index + 1, ordem: item.ordem, resposta: item.resposta })) }; }
export async function createConferenceQuestionBatch(body: Record<string, unknown>) { await requireAdmin(); const current = await law(String(body.law_slug)); const { drafts } = await validateConferenceBatch(current, body.structure_id, body.rows); const result = await db().from("questions").insert(drafts.map((item) => ({ ...values(current, item), ativo: true }))).select(questionFields); if (result.error) fail("criar_lote_conferencia", result.error); return { created: result.data ?? [] }; }
export async function getAdminQuestion(lawSlug: string, questionId: unknown) { await requireAdmin(); const current = await law(lawSlug); const result = await db().from("questions").select(questionFields).eq("id", qid(questionId)).eq("lei_id", current.id).maybeSingle(); if (result.error) fail("carregar_questao", result.error); if (!result.data) throw new AdminQuestoesError(404, "Questão não encontrada para a lei selecionada."); return { law: current, question: result.data }; }
export async function createAdminQuestion(body: Record<string, unknown>) { await requireAdmin(); const current = await law(String(body.law_slug)); const d = draft(body.data); await validateStructure(current.id, d.structure_id); await rejectDuplicateQuestion(current.id, d); const r = await db().from("questions").insert({ ...values(current, d), ativo: true }).select(questionFields).single(); if (r.error || !r.data) fail("criar_questao", r.error); return r.data; }
export async function updateAdminQuestion(body: Record<string, unknown>) { const user = await requireAdmin(); const current = await law(String(body.law_slug)); const questionId = qid(body.id); const d = draft(body.data); await validateStructure(current.id, d.structure_id); await rejectDuplicateQuestion(current.id, d, questionId); const before = await db().from("questions").select(questionFields).eq("id", questionId).eq("lei_id", current.id).eq("ativo", true).maybeSingle(); if (before.error) fail("ler_questao_antes_edicao", before.error); if (!before.data) throw new AdminQuestoesError(404, "Questão ativa não encontrada para a lei selecionada."); const r = await db().from("questions").update(values(current, d)).eq("id", questionId).eq("lei_id", current.id).eq("ativo", true).select(questionFields).maybeSingle(); if (r.error) fail("editar_questao", r.error); if (!r.data) throw new AdminQuestoesError(404, "Questão ativa não encontrada para a lei selecionada."); const audit = await db().rpc("admin_comercial_auditar", { p_ator_user_id: user.id, p_acao: "atualizar", p_entidade: "questao", p_entidade_id: questionId, p_anterior: before.data, p_posterior: r.data, p_detalhes: { origem: "editor_questoes", slug: before.data.slug, ordem_anterior: before.data.ordem, ordem_posterior: d.ordem } }); if (audit.error) console.error("Falha ao auditar edição individual de questão", { questionId, code: audit.error.code }); const sourceChanged = normalizedImportSource({ titulo: String(before.data.titulo ?? ""), assunto: String(before.data.assunto ?? ""), legislacao: String(before.data.legislacao ?? "") }) !== normalizedImportSource({ titulo: d.titulo ?? "", assunto: d.assunto ?? "", legislacao: d.legislacao ?? "" }); const identifiersChanged = String(before.data.ordem) !== d.ordem; if (sourceChanged || identifiersChanged) { const oldReview = await db().from("legisbot_comentarios").update({ precisa_revisao: true }).eq("slug", String(before.data.slug).toUpperCase()).eq("ordem", String(before.data.ordem)); if (oldReview.error) fail("sinalizar_revisao_apos_edicao", oldReview.error); if (identifiersChanged) { const newReview = await db().from("legisbot_comentarios").update({ precisa_revisao: true }).eq("slug", current.slug.toUpperCase()).eq("ordem", d.ordem); if (newReview.error) fail("sinalizar_revisao_nova_ordem", newReview.error); } } return r.data; }
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

function withSlug(rows: ImportedQuestion[], lawSlug: string) { return rows.map((row) => ({ ...row, slug: effectiveAnkiSlug(row.slug, lawSlug) })); }
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
function diagnostics(issues: ImportIssue[], items: Array<{ line: number; deck: string; ordem: string; pergunta: string; status: string; motivo: string | null }>) { return [...issues.map((issue) => ({ severity: "erro", line: issue.line, deck: issue.deck?.join("::") ?? "", ordem: issue.ordem ?? "", pergunta: issue.pergunta ?? "", field: issue.field ?? "arquivo", received: issue.received ?? "", expected: issue.expected ?? "", motivo: issue.message })), ...items.filter((item) => item.status === "erro").map((item) => ({ severity: "erro", line: item.line, deck: item.deck, ordem: item.ordem, pergunta: item.pergunta, field: "estrutura", received: item.deck, expected: "Deck/subdeck com níveis reconhecidos", motivo: item.motivo ?? "Estrutura inválida." }))]; }
async function preview(lawSlug: string, parsed: { rows: ImportedQuestion[]; issues: ImportIssue[] }, mappings: StructureImportMapping = {}, apkg?: Record<string, unknown>) {
  const current = await law(lawSlug);
  const check = validateImportSlug(parsed.rows, current.slug);
  if (!check.valid) throw new AdminQuestoesError(422, check.message ?? "O arquivo não corresponde à legislação selecionada.");
  const rows = withSlug(parsed.rows, current.slug);
  const [existing, nodes] = await Promise.all([
    db().from("questions").select("id,pergunta,slug,ordem,titulo,assunto,legislacao").eq("lei_id", current.id).eq("ativo", true),
    structure(current.id),
  ]);
  if (existing.error) fail("previsualizar", existing.error);
  const existingByPair = new Map<string, typeof existing.data>();
  for (const item of existing.data ?? []) {
    const key = importSourceKey(item as { slug: string; ordem: string });
    existingByPair.set(key, [...(existingByPair.get(key) ?? []), item]);
  }
  const plan = planQuestionDeckStructure(rows, nodes, mappings);
  const decks = new Map(plan.decks.map((deck) => [deck.line, deck]));
  const items = rows.map((row) => {
    const deck = decks.get(row.line);
    const key = importSourceKey(row);
    const invalid = validateImportSource(row);
    const stored = existingByPair.get(key) ?? [];
    const matching = (row.id_questao && /^[0-9a-f-]{36}$/i.test(row.id_questao)
      ? stored.find((item) => item.id === row.id_questao)
      : undefined) ?? stored.find((item) => item.pergunta.trim() === row.pergunta.trim());
    const sourceChanged = Boolean(matching) && normalizedImportSource(row) !== normalizedImportSource({ titulo: matching!.titulo ?? "", assunto: matching!.assunto ?? "", legislacao: matching!.legislacao ?? "" });
    const reason = deck?.error ?? invalid;
    return {
      line: row.line,
      deck: row.deck.join("::"),
      ordem: row.ordem,
      pergunta: row.pergunta,
      existing_id: matching?.id ?? null,
      status: reason ? "erro" : matching ? sourceChanged ? "atualizada" : "duplicada" : "nova",
      motivo: reason,
    };
  });
  const replacementById = new Map<string, ImportedQuestion>();
  const incomingWithoutMatch: ImportedQuestion[] = [];
  const itemByLine = new Map(items.map((item) => [item.line, item]));
  for (const row of rows) {
    const item = itemByLine.get(row.line);
    if (!item || item.status === "erro") continue;
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
  const errors = [...diagnostics(parsed.issues, items), ...plan.nodes.filter((node) => node.mappingError).map((node) => ({ severity: "erro", line: 0, deck: node.path, ordem: "", pergunta: "", field: "mapeamento", received: node.path, expected: "Destino sugerido do mesmo caminho", motivo: node.mappingError! }))];
  const structurePreview = plan.nodes.map((node) => ({ key: node.key, path: node.path, tipo: node.tipo, status: node.mappingError ? "erro" as const : node.requiresMapping ? "revisao" as const : node.existingId === null ? "nova" as const : "existente" as const, destination_id: node.existingId, candidates: node.candidates }));
  return { law: current, slug: check, total: rows.length, issues: parsed.issues, errors, warnings, items, structure: { items: structurePreview, existentes: structurePreview.filter((node) => node.status === "existente").length, novas: structurePreview.filter((node) => node.status === "nova").length, revisoes: structurePreview.filter((node) => node.status === "revisao").length }, summary: { novas: items.filter((item) => item.status === "nova").length, atualizadas: items.filter((item) => item.status === "atualizada").length, duplicadas: items.filter((item) => item.status === "duplicada").length, conflitos: warnings.filter((warning) => warning.kind === "legislacao").length, avisos: warnings.length, erros: errors.length }, ...(apkg ? { apkg } : {}) };
}
export async function previewAnkiImport(body: Record<string, unknown>) { await requireAdmin(); if (typeof body.text !== "string" || body.text.length > 20_000_000) throw new AdminQuestoesError(400, "Arquivo TXT inválido ou grande demais."); try { return preview(slug(body.law_slug), parseAnkiTxt(body.text), structureMappings(body.structure_mappings)); } catch (error) { if (error instanceof AdminQuestoesError) throw error; throw new AdminQuestoesError(400, error instanceof Error ? error.message : "TXT inválido."); } }
export async function previewApkgImport(lawSlug: unknown, file: File, mappings: unknown = {}) { await requireAdmin(); if (!file.name.toLowerCase().endsWith(".apkg") || !file.size || file.size > 100_000_000) throw new AdminQuestoesError(400, "Arquivo APKG inválido ou grande demais."); let parsed; try { parsed = await parseLegisApkg(new Uint8Array(await file.arrayBuffer())); } catch (error) { throw new AdminQuestoesError(400, error instanceof Error ? error.message : "APKG inválido."); } if (parsed.media.some((media) => media.referenced)) throw new AdminQuestoesError(422, "O APKG possui mídia referenciada. O suporte a mídia ainda não faz parte desta etapa."); return preview(slug(lawSlug), { rows: parsed.rows, issues: parsed.issues }, structureMappings(mappings), { rootDecks: parsed.rootDecks ?? [], subdecks: parsed.subdecks ?? [], notes: parsed.notes ?? 0, cards: parsed.cards ?? 0, recognizedModels: parsed.recognizedModels ?? [], unrecognizedModels: parsed.unrecognizedModels ?? [], media: parsed.media ?? [], samples: parsed.rows.slice(0, 5) }); }
async function markImportConflictsForReview(warnings: Array<{ kind: string; slug: string; ordem: string }>) {
  for (const warning of warnings.filter((item) => item.kind === "legislacao")) {
    const review = await db().from("legisbot_comentarios").update({ precisa_revisao: true }).eq("slug", warning.slug).eq("ordem", warning.ordem);
    if (review.error) fail("sinalizar_conflito_importacao", review.error);
  }
}
async function persist(lawSlug: string, rows: ImportedQuestion[], previewData: Awaited<ReturnType<typeof preview>>, mappings: StructureImportMapping, ignored = 0) {
  if (!previewData.slug.valid || previewData.errors.length || previewData.structure.revisoes) throw new AdminQuestoesError(422, "A importação possui linhas inválidas ou destinos estruturais ainda não revisados.");
  const current = await law(lawSlug);
  const normalizedRows = withSlug(rows, current.slug);
  const previewByLine = new Map(previewData.items.map((item) => [item.line, item]));
  const statusByLine = new Map(previewData.items.map((item) => [item.line, item.status]));
  const newRows = normalizedRows.filter((row) => statusByLine.get(row.line) === "nova");
  const updatedRows = normalizedRows.filter((row) => statusByLine.get(row.line) === "atualizada");
  for (const row of updatedRows) {
    const existingId = previewByLine.get(row.line)?.existing_id;
    if (!existingId) throw new AdminQuestoesError(422, "A questão que seria atualizada não pôde ser identificada com segurança.");
    const questionUpdate = await db().from("questions").update({ titulo: row.titulo, assunto: row.assunto, legislacao: row.legislacao, pergunta: row.pergunta, resposta: row.resposta, justificativa: row.justificativa || null, total_artigos: /^\d+$/.test(row.total_artigos) ? Number(row.total_artigos) : null, ultima_alteracao_legislativa: row.ultima_alteracao_legislativa || null }).eq("id", existingId).eq("lei_id", current.id).eq("ativo", true);
    if (questionUpdate.error) fail("atualizar_questao_importada", questionUpdate.error);
    const review = await db().from("legisbot_comentarios").update({ precisa_revisao: true }).eq("slug", row.slug.toUpperCase()).eq("ordem", row.ordem);
    if (review.error) fail("sinalizar_revisao_legisbot", review.error);
  }
  if (!newRows.length) {
    await markImportConflictsForReview(previewData.warnings);
    return { lidas: rows.length, importadas: 0, atualizadas: updatedRows.length, duplicadas: previewData.summary.duplicadas, ignoradas: ignored, conflitos: previewData.summary.conflitos, avisos: previewData.warnings, erros: 0, estruturas_criadas: 0, estruturas_reutilizadas: (await structure(current.id)).length };
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
  await markImportConflictsForReview(previewData.warnings);
  return { lidas: rows.length, importadas: inserted.data?.length ?? 0, atualizadas: updatedRows.length, duplicadas: previewData.summary.duplicadas, ignoradas: ignored, conflitos: previewData.summary.conflitos, avisos: previewData.warnings, erros: 0, estruturas_criadas: plan.nodes.filter((node) => node.existingId === null).length, estruturas_reutilizadas: plan.nodes.filter((node) => node.existingId !== null).length };
}
export async function importAnkiTxt(body: Record<string, unknown>) { await requireAdmin(); const parsed = parseAnkiTxt(String(body.text)); const mappings = structureMappings(body.structure_mappings); const data = await preview(slug(body.law_slug), parsed, mappings); return persist(slug(body.law_slug), parsed.rows, data, mappings); }
export async function importApkg(body: { lawSlug: unknown; file: File; structureMappings?: unknown }) { await requireAdmin(); const parsed = await parseLegisApkg(new Uint8Array(await body.file.arrayBuffer())); const mappings = structureMappings(body.structureMappings); const data = await previewApkgImport(body.lawSlug, body.file, mappings); return persist(slug(body.lawSlug), parsed.rows, data, mappings, parsed.unrecognizedModels.reduce((sum, model) => sum + model.notes, 0)); }
