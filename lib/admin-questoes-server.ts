import "server-only";

import { obterAdministrador } from "@/lib/admin-auth";
import { parseQuestionDraft, type QuestionDraft } from "@/lib/admin-questoes";
import { getSupabaseServerClient } from "@/lib/supabase-server";
import { supabaseQuestoes } from "@/lib/supabase-questoes-server";
import { effectiveAnkiSlug, parseAnkiTxt, validateImportSlug } from "@/lib/anki-txt-import";
import { parseLegisApkg } from "@/lib/anki-apkg-import";
import type { ImportedQuestion, ImportIssue } from "@/lib/imported-question";
import { compareQuestionStructureNames, planQuestionDeckStructure, type QuestionStructureNode } from "@/lib/questoes-structure";
import { unifiedLawBySlug, unifiedQuestions, unifiedStructure, usesUnifiedStagingQuestions, withUnifiedStagingClient } from "@/lib/unified-questions-staging-server";

export class AdminQuestoesError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

type MainLaw = { id: number; slug: string; titulo: string; nome_curto: string | null; codigo: string | null };
type QuestionLaw = { id: string; slug: string };
type StructureType = "titulo" | "capitulo" | "secao" | "subsecao";
const structureTypes: StructureType[] = ["titulo", "capitulo", "secao", "subsecao"];
const validParents: Record<StructureType, StructureType | null | "law"> = { titulo: "law", capitulo: null, secao: "capitulo", subsecao: "secao" };

async function requireAdmin() {
  const administrator = await obterAdministrador();
  if (!administrator) throw new AdminQuestoesError(401, "Autenticação administrativa obrigatória.");
  return administrator;
}

function safeDatabaseError(context: string, error: { code?: string; message?: string; details?: string; hint?: string } | null): never {
  console.error("Falha na administração de questões", {
    context,
    code: error?.code ?? null,
    message: error?.message ?? null,
    details: error?.details ?? null,
    hint: error?.hint ?? null,
  });
  throw new AdminQuestoesError(502, "Não foi possível concluir a operação no banco de questões.");
}

function slug(value: unknown) {
  if (typeof value !== "string" || !/^[a-z0-9-]{1,160}$/.test(value)) {
    throw new AdminQuestoesError(400, "Lei inválida.");
  }
  return value;
}

function questionId(value: unknown) {
  if (typeof value !== "string" || !/^[0-9a-f-]{36}$/i.test(value)) {
    throw new AdminQuestoesError(400, "Questão inválida.");
  }
  return value;
}

async function activeMainLaw(lawSlug: string): Promise<MainLaw> {
  const result = await getSupabaseServerClient()
    .from("leis")
    .select("id,slug,titulo,nome_curto,codigo")
    .eq("slug", lawSlug)
    .eq("ativo", true)
    .maybeSingle();
  if (result.error) safeDatabaseError("carregar_lei_principal", result.error);
  if (!result.data) throw new AdminQuestoesError(404, "Lei ativa não encontrada no banco principal.");
  return result.data as MainLaw;
}

async function stagingLaw(lawSlug: string): Promise<MainLaw> {
  const law = await unifiedLawBySlug(lawSlug);
  if (!law) throw new AdminQuestoesError(404, "Lei ativa não encontrada no staging unificado.");
  return law as MainLaw;
}

function stagingQuestionValues(law: MainLaw, draft: QuestionDraft) {
  return [law.id, draft.structure_id, draft.pergunta, draft.resposta, draft.justificativa, draft.assunto, draft.legislacao, draft.ordem, draft.titulo, draft.total_artigos, law.slug, draft.capitulo, draft.secao, draft.subsecao, draft.artigo];
}

async function findQuestionLaw(lawSlug: string): Promise<QuestionLaw | null> {
  const result = await supabaseQuestoes.from("laws").select("id,slug").eq("slug", lawSlug).maybeSingle();
  if (result.error) safeDatabaseError("localizar_lei_questoes", result.error);
  return result.data as QuestionLaw | null;
}

async function ensureQuestionLaw(law: MainLaw): Promise<QuestionLaw> {
  const existing = await findQuestionLaw(law.slug);
  if (existing) {
    if (existing.slug !== law.slug) throw new AdminQuestoesError(409, "A lei de questões não corresponde ao slug selecionado.");
    return existing;
  }

  const inserted = await supabaseQuestoes.from("laws").insert({
    slug: law.slug,
    titulo: law.titulo,
    nome_curto: law.nome_curto,
    ativo: true,
  }).select("id,slug").single();
  if (!inserted.error && inserted.data) return inserted.data as QuestionLaw;

  // Em uma gravação simultânea outro administrador pode ter criado o mesmo slug.
  if (inserted.error?.code === "23505") {
    const concurrent = await findQuestionLaw(law.slug);
    if (concurrent) return concurrent;
  }
  safeDatabaseError("criar_lei_questoes", inserted.error);
}

function draftFromBody(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new AdminQuestoesError(400, "Dados da questão inválidos.");
  }
  try {
    return parseQuestionDraft(value as Record<string, unknown>);
  } catch (error) {
    throw new AdminQuestoesError(400, error instanceof Error ? error.message : "Dados da questão inválidos.");
  }
}

function databaseQuestion(draft: QuestionDraft, lawId: string) {
  return { law_id: lawId, ...draft, ativo: true };
}

async function structureForLaw(lawId: string) {
  const result = await supabaseQuestoes.from("law_structure").select("id,law_id,parent_id,tipo,nome,ordem,ativo,created_at,updated_at").eq("law_id", lawId).eq("ativo", true).order("ordem").order("id");
  if (result.error) safeDatabaseError("listar_estrutura", result.error);
  return [...(result.data ?? [])].sort(compareQuestionStructureNames) as QuestionStructureNode[];
}
async function questionLawForSlug(lawSlug: string) { const law = await activeMainLaw(slug(lawSlug)); const questionLaw = await findQuestionLaw(law.slug); if (!questionLaw) throw new AdminQuestoesError(404, "Lei de questões não encontrada."); return { law, questionLaw }; }
function structureType(value: unknown): StructureType { if (typeof value !== "string" || !structureTypes.includes(value as StructureType)) throw new AdminQuestoesError(400, "Tipo estrutural inválido."); return value as StructureType; }
function optionalStructureId(value: unknown) { if (value === null || value === undefined || value === "") return null; const id = Number(value); if (!Number.isSafeInteger(id) || id < 1) throw new AdminQuestoesError(400, "Estrutura inválida."); return id; }
function structureText(value: unknown, label: string, max = 500) { if (typeof value !== "string" || !value.trim() || value.trim().length > max) throw new AdminQuestoesError(400, `${label} inválido.`); return value.trim(); }
async function validateQuestionStructure(questionLawId: string, structureId: number | null) { if (!structureId) return; const result = await supabaseQuestoes.from("law_structure").select("id").eq("id", structureId).eq("law_id", questionLawId).eq("ativo", true).maybeSingle(); if (result.error) safeDatabaseError("validar_estrutura_questao", result.error); if (!result.data) throw new AdminQuestoesError(422, "A estrutura selecionada não pertence à lei ativa."); }
function rowsWithEffectiveSlug(rows: ImportedQuestion[], lawSlug: string) { return rows.map((row) => ({ ...row, slug: effectiveAnkiSlug(row.slug, lawSlug) })); }
function importDiagnostics(issues: ImportIssue[], items: Array<{ line: number; deck: string; ordem?: string; pergunta?: string; status: string; motivo: string | null }>) {
  return [
    ...issues.map((issue) => ({ severity: "erro" as const, line: issue.line, deck: issue.deck?.join("::") ?? "", ordem: issue.ordem ?? "", pergunta: issue.pergunta ?? "", field: issue.field ?? "arquivo", received: issue.received ?? "", expected: issue.expected ?? "", motivo: issue.message })),
    ...items.filter((item) => item.status === "erro").map((item) => ({ severity: "erro" as const, line: item.line, deck: item.deck, ordem: item.ordem ?? "", pergunta: item.pergunta ?? "", field: "estrutura", received: item.deck, expected: "Deck/subdeck com níveis reconhecidos", motivo: item.motivo ?? "Estrutura inválida." })),
  ];
}
async function createImportStructure(questionLawId: string, rows: ReturnType<typeof parseAnkiTxt>["rows"]) {
  const current = await structureForLaw(questionLawId); const plan = planQuestionDeckStructure(rows, current); const invalid = plan.decks.find((deck) => deck.error);
  if (invalid) throw new AdminQuestoesError(422, invalid.error ?? "Estrutura do deck inválida.");
  const ids = new Map(plan.nodes.filter((node) => node.existingId !== null).map((node) => [node.key, node.existingId!]));
  for (const node of plan.nodes) {
    if (ids.has(node.key)) continue;
    const parentId = node.parentKey ? ids.get(node.parentKey) : null;
    if (node.parentKey && !parentId) throw new AdminQuestoesError(422, "Estrutura pai não pôde ser criada.");
    const inserted = await supabaseQuestoes.from("law_structure").insert({ law_id: questionLawId, parent_id: parentId ?? null, tipo: node.tipo, nome: node.nome, ordem: 0, ativo: true }).select("id").single();
    if (inserted.error || !inserted.data) safeDatabaseError("criar_estrutura_importacao", inserted.error);
    ids.set(node.key, inserted.data.id);
  }
  return new Map(plan.decks.map((deck) => [deck.line, deck.structureKey ? ids.get(deck.structureKey) ?? null : null]));
}

async function stagingDeletionSummary(law: MainLaw, id: number) {
  const nodes = await unifiedStructure(law.id) as QuestionStructureNode[];
  const root = nodes.find((node) => node.id === id);
  if (!root) throw new AdminQuestoesError(404, "Estrutura ativa não encontrada.");
  const children = new Map<number, QuestionStructureNode[]>();
  for (const node of nodes) if (node.parent_id !== null) children.set(node.parent_id, [...(children.get(node.parent_id) ?? []), node]);
  const descendants = (node: QuestionStructureNode): QuestionStructureNode[] => [node, ...(children.get(node.id) ?? []).flatMap(descendants)];
  const affected = descendants(root); const ids = affected.map((node) => node.id);
  const questionRows = await withUnifiedStagingClient(async (client) => (await client.query("select id::text as id,structure_id::int as structure_id from public.questions where lei_id=$1 and ativo=true and structure_id=any($2::bigint[])", [law.id, ids])).rows as Array<{ id: string; structure_id: number }>);
  const byType = Object.fromEntries((['titulo', 'capitulo', 'secao', 'subsecao'] as StructureType[]).map((type) => [type, affected.filter((node) => node.id !== root.id && node.tipo === type).length]));
  const directQuestions = questionRows.filter((question) => question.structure_id === root.id).length;
  return { id: root.id, nome: root.nome, tipo: root.tipo, ids, descendentes: affected.length - 1, por_tipo: byType, questoes: questionRows.length, questoes_diretas: directQuestions, questoes_descendentes: questionRows.length - directQuestions, pode_excluir: !questionRows.length };
}

async function stagingImportStructure(law: MainLaw, rows: ReturnType<typeof parseAnkiTxt>["rows"]) {
  const current = await unifiedStructure(law.id) as QuestionStructureNode[];
  const plan = planQuestionDeckStructure(rows, current); const invalid = plan.decks.find((deck) => deck.error);
  if (invalid) throw new AdminQuestoesError(422, invalid.error ?? "Estrutura do deck inválida.");
  return withUnifiedStagingClient(async (client) => {
    await client.query("begin");
    try {
      const ids = new Map(plan.nodes.filter((node) => node.existingId !== null).map((node) => [node.key, node.existingId!]));
      for (const node of plan.nodes) {
        if (ids.has(node.key)) continue;
        const parentId = node.parentKey ? ids.get(node.parentKey) : null;
        if (node.parentKey && !parentId) throw new AdminQuestoesError(422, "Estrutura pai não pôde ser criada.");
        const inserted = await client.query("insert into public.law_structure (lei_id,parent_id,tipo,nome,ordem,ativo) values ($1,$2,$3,$4,0,true) returning id::int as id", [law.id, parentId, node.tipo, node.nome]);
        ids.set(node.key, inserted.rows[0].id);
      }
      await client.query("commit");
      return new Map(plan.decks.map((deck) => [deck.line, deck.structureKey ? ids.get(deck.structureKey) ?? null : null]));
    } catch (error) { await client.query("rollback"); throw error; }
  });
}

export async function listAdminQuestionLaws() {
  await requireAdmin();
  const result = await getSupabaseServerClient()
    .from("leis")
    .select("id,slug,titulo,nome_curto,codigo")
    .eq("ativo", true)
    .order("ordem", { ascending: true })
    .order("titulo", { ascending: true });
  if (result.error) safeDatabaseError("listar_leis_principais", result.error);
  return result.data ?? [];
}

export async function listQuestionContent(lawSlug: string) {
  if (usesUnifiedStagingQuestions(slug(lawSlug))) {
    const law = await stagingLaw(lawSlug);
    const [questions, structure] = await Promise.all([unifiedQuestions(law.id), unifiedStructure(law.id)]);
    console.info("questoes_source=main", { slug: lawSlug });
    return { law, questions, structure };
  }
  const law = await activeMainLaw(slug(lawSlug));
  const questionLaw = await findQuestionLaw(law.slug);
  if (!questionLaw) return { law, questions: [], structure: [] };
  const result = await supabaseQuestoes
    .from("questions")
    .select("id,law_id,structure_id,pergunta,resposta,justificativa,assunto,legislacao,ordem,titulo,total_artigos,slug,ultima_alteracao_legislativa,capitulo,secao,subsecao,artigo,ativo,created_at,updated_at")
    .eq("law_id", questionLaw.id)
    .eq("ativo", true)
    .order("ordem", { ascending: true })
    .order("created_at", { ascending: true });
  if (result.error) safeDatabaseError("listar_questoes", result.error);
  return { law, questions: result.data ?? [], structure: await structureForLaw(questionLaw.id) };
}

export async function listAdminQuestions(lawSlug: string) {
  await requireAdmin();
  return listQuestionContent(lawSlug);
}

export async function createAdminQuestion(body: Record<string, unknown>) {
  await requireAdmin();
  if (usesUnifiedStagingQuestions(slug(body.law_slug))) {
    const law = await stagingLaw(String(body.law_slug)); const draft = draftFromBody(body.data);
    const row = await withUnifiedStagingClient(async (client) => {
      if (draft.structure_id !== null) {
        const valid = await client.query("select 1 from public.law_structure where id=$1 and lei_id=$2 and ativo=true", [draft.structure_id, law.id]);
        if (!valid.rowCount) throw new AdminQuestoesError(422, "A estrutura selecionada não pertence à lei ativa.");
      }
      return (await client.query("insert into public.questions (lei_id,structure_id,pergunta,resposta,justificativa,assunto,legislacao,ordem,titulo,total_artigos,slug,capitulo,secao,subsecao,artigo,ativo) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,true) returning id::text as id,lei_id::int as law_id,structure_id::int as structure_id,pergunta,resposta,justificativa,assunto,legislacao,ordem,titulo,total_artigos,slug,capitulo,secao,subsecao,artigo,ativo,created_at,updated_at", stagingQuestionValues(law, draft))).rows[0];
    });
    return row;
  }
  const law = await activeMainLaw(slug(body.law_slug));
  const questionLaw = await ensureQuestionLaw(law);
  const draft = draftFromBody(body.data);
  await validateQuestionStructure(questionLaw.id, draft.structure_id);
  const result = await supabaseQuestoes.from("questions").insert(databaseQuestion(draft, questionLaw.id)).select().single();
  if (result.error) safeDatabaseError("criar_questao", result.error);
  return result.data;
}

export async function updateAdminQuestion(body: Record<string, unknown>) {
  await requireAdmin();
  if (usesUnifiedStagingQuestions(slug(body.law_slug))) {
    const law = await stagingLaw(String(body.law_slug)); const draft = draftFromBody(body.data); const id = questionId(body.id);
    const row = await withUnifiedStagingClient(async (client) => {
      if (draft.structure_id !== null) { const valid = await client.query("select 1 from public.law_structure where id=$1 and lei_id=$2 and ativo=true", [draft.structure_id, law.id]); if (!valid.rowCount) throw new AdminQuestoesError(422, "A estrutura selecionada não pertence à lei ativa."); }
      const values = [...stagingQuestionValues(law, draft).slice(1), id, law.id];
      return (await client.query("update public.questions set structure_id=$1,pergunta=$2,resposta=$3,justificativa=$4,assunto=$5,legislacao=$6,ordem=$7,titulo=$8,total_artigos=$9,slug=$10,capitulo=$11,secao=$12,subsecao=$13,artigo=$14 where id=$15 and lei_id=$16 and ativo=true returning id::text as id,lei_id::int as law_id,structure_id::int as structure_id,pergunta,resposta,justificativa,assunto,legislacao,ordem,titulo,total_artigos,slug,capitulo,secao,subsecao,artigo,ativo,created_at,updated_at", values)).rows[0] ?? null;
    });
    if (!row) throw new AdminQuestoesError(404, "Questão ativa não encontrada para a lei selecionada.");
    return row;
  }
  const law = await activeMainLaw(slug(body.law_slug));
  const questionLaw = await findQuestionLaw(law.slug);
  if (!questionLaw) throw new AdminQuestoesError(404, "Lei de questões não encontrada.");
  const draft = draftFromBody(body.data);
  await validateQuestionStructure(questionLaw.id, draft.structure_id);
  const result = await supabaseQuestoes
    .from("questions")
    .update(draft)
    .eq("id", questionId(body.id))
    .eq("law_id", questionLaw.id)
    .eq("ativo", true)
    .select()
    .maybeSingle();
  if (result.error) safeDatabaseError("editar_questao", result.error);
  if (!result.data) throw new AdminQuestoesError(404, "Questão ativa não encontrada para a lei selecionada.");
  return result.data;
}

/** Edição contextual no player: preserva os vínculos estruturais já existentes. */
export async function updateQuickAdminQuestion(body: Record<string, unknown>) {
  await requireAdmin();
  const lawSlug = slug(body.law_slug);
  const id = questionId(body.id);
  if (!body.data || typeof body.data !== "object" || Array.isArray(body.data)) {
    throw new AdminQuestoesError(400, "Dados da questão inválidos.");
  }
  const incoming = body.data as Record<string, unknown>;
  const allowed = ["pergunta", "resposta", "justificativa", "assunto", "legislacao", "ordem"];
  if (Object.keys(incoming).some((field) => !allowed.includes(field))) {
    throw new AdminQuestoesError(400, "A edição rápida não permite alterar a estrutura da questão.");
  }
  const current = (await listAdminQuestions(lawSlug)).questions.find((question: { id: string }) => question.id === id);
  if (!current) throw new AdminQuestoesError(404, "Questão ativa não encontrada para a lei selecionada.");
  return updateAdminQuestion({
    action: "atualizar",
    law_slug: lawSlug,
    id,
    data: {
      structure_id: current.structure_id,
      pergunta: incoming.pergunta,
      resposta: incoming.resposta,
      justificativa: incoming.justificativa,
      assunto: incoming.assunto,
      legislacao: incoming.legislacao,
      ordem: incoming.ordem,
      titulo: current.titulo,
      total_artigos: current.total_artigos,
      capitulo: current.capitulo,
      secao: current.secao,
      subsecao: current.subsecao,
      artigo: current.artigo,
    },
  });
}

export async function createStructureNode(body: Record<string, unknown>) {
  await requireAdmin();
  if (usesUnifiedStagingQuestions(slug(body.law_slug))) {
    const law = await stagingLaw(String(body.law_slug)); const tipo = structureType(body.tipo); const parentId = optionalStructureId(body.parent_id);
    const row = await withUnifiedStagingClient(async (client) => {
      if (parentId) { const parent = await client.query("select tipo from public.law_structure where id=$1 and lei_id=$2 and ativo=true", [parentId, law.id]); if (!parent.rowCount || validParents[tipo] !== parent.rows[0].tipo) throw new AdminQuestoesError(422, "Relação estrutural inválida para esta lei."); }
      else if (validParents[tipo] !== "law" && tipo !== "capitulo") throw new AdminQuestoesError(422, "Este nível exige um nível pai compatível.");
      return (await client.query("insert into public.law_structure (lei_id,parent_id,tipo,nome,ordem,ativo) values ($1,$2,$3,$4,$5,true) returning id::int as id,lei_id::int as law_id,parent_id::int as parent_id,tipo,nome,ordem,ativo,created_at,updated_at", [law.id, parentId, tipo, structureText(body.nome, "Nome"), optionalStructureId(body.ordem) ?? 0])).rows[0];
    }); return row;
  }
  await requireAdmin(); const { questionLaw } = await questionLawForSlug(String(body.law_slug ?? "")); const tipo = structureType(body.tipo); const parentId = optionalStructureId(body.parent_id);
  if (parentId) { const parent = await supabaseQuestoes.from("law_structure").select("law_id,tipo").eq("id", parentId).maybeSingle(); if (parent.error) safeDatabaseError("validar_pai_estrutura", parent.error); if (!parent.data || parent.data.law_id !== questionLaw.id || validParents[tipo] !== parent.data.tipo) throw new AdminQuestoesError(422, "Relação estrutural inválida para esta lei."); }
  else if (validParents[tipo] !== "law" && tipo !== "capitulo") throw new AdminQuestoesError(422, "Este nível exige um nível pai compatível.");
  const result = await supabaseQuestoes.from("law_structure").insert({ law_id: questionLaw.id, parent_id: parentId, tipo, nome: structureText(body.nome, "Nome"), ordem: optionalStructureId(body.ordem) ?? 0, ativo: true }).select().single(); if (result.error) safeDatabaseError("criar_estrutura", result.error); return result.data;
}
export async function updateStructureNode(body: Record<string, unknown>) {
  await requireAdmin();
  if (usesUnifiedStagingQuestions(slug(body.law_slug))) { const law = await stagingLaw(String(body.law_slug)); const id = optionalStructureId(body.id); if (!id) throw new AdminQuestoesError(400, "Estrutura inválida."); const row = await withUnifiedStagingClient(async (client) => (await client.query("update public.law_structure set nome=$1,ordem=$2 where id=$3 and lei_id=$4 and ativo=true returning id::int as id,lei_id::int as law_id,parent_id::int as parent_id,tipo,nome,ordem,ativo,created_at,updated_at", [structureText(body.nome, "Nome"), optionalStructureId(body.ordem) ?? 0, id, law.id])).rows[0] ?? null); if (!row) throw new AdminQuestoesError(404, "Estrutura ativa não encontrada."); return row; }
  await requireAdmin(); const { questionLaw } = await questionLawForSlug(String(body.law_slug ?? "")); const id = optionalStructureId(body.id); if (!id) throw new AdminQuestoesError(400, "Estrutura inválida."); const result = await supabaseQuestoes.from("law_structure").update({ nome: structureText(body.nome, "Nome"), ordem: optionalStructureId(body.ordem) ?? 0 }).eq("id", id).eq("law_id", questionLaw.id).eq("ativo", true).select().maybeSingle(); if (result.error) safeDatabaseError("editar_estrutura", result.error); if (!result.data) throw new AdminQuestoesError(404, "Estrutura ativa não encontrada."); return result.data;
}
export async function deactivateStructureNode(body: Record<string, unknown>) {
  await requireAdmin();
  if (usesUnifiedStagingQuestions(slug(body.law_slug))) { const law = await stagingLaw(String(body.law_slug)); const id = optionalStructureId(body.id); if (!id) throw new AdminQuestoesError(400, "Estrutura inválida."); const row = await withUnifiedStagingClient(async (client) => (await client.query("update public.law_structure set ativo=false where id=$1 and lei_id=$2 and ativo=true returning id::int as id", [id, law.id])).rows[0] ?? null); if (!row) throw new AdminQuestoesError(404, "Estrutura ativa não encontrada."); return row; }
  await requireAdmin(); const { questionLaw } = await questionLawForSlug(String(body.law_slug ?? "")); const id = optionalStructureId(body.id); if (!id) throw new AdminQuestoesError(400, "Estrutura inválida."); const result = await supabaseQuestoes.from("law_structure").update({ ativo: false }).eq("id", id).eq("law_id", questionLaw.id).eq("ativo", true).select("id").maybeSingle(); if (result.error) safeDatabaseError("desativar_estrutura", result.error); if (!result.data) throw new AdminQuestoesError(404, "Estrutura ativa não encontrada."); return result.data;
}
export async function structureDeletionSummary(body: Record<string, unknown>) {
  await requireAdmin();
  if (usesUnifiedStagingQuestions(slug(body.law_slug))) { const law = await stagingLaw(String(body.law_slug)); const id = optionalStructureId(body.id); if (!id) throw new AdminQuestoesError(400, "Estrutura inválida."); return stagingDeletionSummary(law, id); }
  await requireAdmin(); const { questionLaw } = await questionLawForSlug(String(body.law_slug ?? "")); const id = optionalStructureId(body.id); if (!id) throw new AdminQuestoesError(400, "Estrutura inválida."); const nodes = await structureForLaw(questionLaw.id); const root = nodes.find((node) => node.id === id); if (!root) throw new AdminQuestoesError(404, "Estrutura ativa não encontrada.");
  const children = new Map<number, QuestionStructureNode[]>(); for (const node of nodes) if (node.parent_id !== null) children.set(node.parent_id, [...(children.get(node.parent_id) ?? []), node]); const descendants = (node: QuestionStructureNode): QuestionStructureNode[] => [node, ...(children.get(node.id) ?? []).flatMap(descendants)]; const affected = descendants(root); const ids = affected.map((node) => node.id);
  const questions = await supabaseQuestoes.from("questions").select("id,structure_id").eq("law_id", questionLaw.id).eq("ativo", true).in("structure_id", ids); if (questions.error) safeDatabaseError("resumo_exclusao_estrutura", questions.error);
  const byType = Object.fromEntries((["titulo", "capitulo", "secao", "subsecao"] as StructureType[]).map((type) => [type, affected.filter((node) => node.id !== root.id && node.tipo === type).length]));
  const directQuestions = questions.data?.filter((question) => question.structure_id === root.id).length ?? 0;
  const descendantQuestions = (questions.data?.length ?? 0) - directQuestions;
  return { id: root.id, nome: root.nome, tipo: root.tipo, ids, descendentes: affected.length - 1, por_tipo: byType, questoes: questions.data?.length ?? 0, questoes_diretas: directQuestions, questoes_descendentes: descendantQuestions, pode_excluir: !(questions.data?.length) };
}
export async function deleteStructureNode(body: Record<string, unknown>) {
  const summary = await structureDeletionSummary(body); if (!summary.pode_excluir) throw new AdminQuestoesError(422, `Este item não pode ser excluído porque existem ${summary.questoes} questões vinculadas a ele ou aos seus subitens. Mova ou exclua essas questões antes de remover a estrutura.`);
  if (usesUnifiedStagingQuestions(slug(body.law_slug))) { const law = await stagingLaw(String(body.law_slug)); const row = await withUnifiedStagingClient(async (client) => (await client.query("delete from public.law_structure where id=$1 and lei_id=$2 returning id::int as id", [summary.id, law.id])).rows[0] ?? null); if (!row) throw new AdminQuestoesError(404, "Estrutura ativa não encontrada."); return { ...summary, excluido: true }; }
  const { questionLaw } = await questionLawForSlug(String(body.law_slug ?? "")); const result = await supabaseQuestoes.from("law_structure").delete().eq("id", summary.id).eq("law_id", questionLaw.id).select("id").maybeSingle(); if (result.error) safeDatabaseError("excluir_estrutura", result.error); if (!result.data) throw new AdminQuestoesError(404, "Estrutura ativa não encontrada."); return { ...summary, excluido: true };
}

export async function deactivateAdminQuestion(body: Record<string, unknown>) {
  await requireAdmin();
  if (usesUnifiedStagingQuestions(slug(body.law_slug))) {
    const law = await stagingLaw(String(body.law_slug)); const id = questionId(body.id);
    const row = await withUnifiedStagingClient(async (client) => (await client.query("update public.questions set ativo=false where id=$1 and lei_id=$2 and ativo=true returning id::text as id", [id, law.id])).rows[0] ?? null);
    if (!row) throw new AdminQuestoesError(404, "Questão ativa não encontrada para a lei selecionada.");
    return { id: row.id, ativo: false };
  }
  const law = await activeMainLaw(slug(body.law_slug));
  const questionLaw = await findQuestionLaw(law.slug);
  if (!questionLaw) throw new AdminQuestoesError(404, "Lei de questões não encontrada.");
  const result = await supabaseQuestoes
    .from("questions")
    .update({ ativo: false })
    .eq("id", questionId(body.id))
    .eq("law_id", questionLaw.id)
    .eq("ativo", true)
    .select("id")
    .maybeSingle();
  if (result.error) safeDatabaseError("desativar_questao", result.error);
  if (!result.data) throw new AdminQuestoesError(404, "Questão ativa não encontrada para a lei selecionada.");
  return { id: result.data.id, ativo: false };
}

export async function previewAnkiImport(body: Record<string, unknown>) {
  await requireAdmin();
  const lawSlug = slug(body.law_slug); const staging = usesUnifiedStagingQuestions(lawSlug);
  const law = staging ? await stagingLaw(lawSlug) : await activeMainLaw(lawSlug);
  if (typeof body.text !== "string" || body.text.length > 20_000_000) throw new AdminQuestoesError(400, "Arquivo TXT inválido ou grande demais.");
  let parsed; try { parsed = parseAnkiTxt(body.text); } catch (error) { throw new AdminQuestoesError(400, error instanceof Error ? error.message : "TXT inválido."); }
  const slugCheck = validateImportSlug(parsed.rows, law.slug);
  if (!slugCheck.valid) throw new AdminQuestoesError(422, slugCheck.message ?? "O arquivo não corresponde à legislação selecionada.");
  const rows = rowsWithEffectiveSlug(parsed.rows, law.slug);
  const questionLaw = staging ? null : await findQuestionLaw(law.slug);
  const structure = staging ? await unifiedStructure(law.id) as QuestionStructureNode[] : questionLaw ? await structureForLaw(questionLaw.id) : [];
  const structurePlan = planQuestionDeckStructure(rows, structure); const decksByLine = new Map(structurePlan.decks.map((deck) => [deck.line, deck]));
  const existing = staging ? { data: (await unifiedQuestions(law.id)).map((question) => ({ pergunta: question.pergunta, slug: question.slug, ordem: question.ordem })), error: null } : questionLaw ? await supabaseQuestoes.from("questions").select("pergunta,slug,ordem").eq("law_id", questionLaw.id) : { data: [], error: null };
  if (existing.error) safeDatabaseError("previsualizar_importacao", existing.error);
  const known = new Set((existing.data ?? []).map((x) => `${x.slug}\u0000${x.ordem}\u0000${x.pergunta}`));
  const items = rows.map((row) => { const deck = decksByLine.get(row.line); const duplicate = known.has(`${row.slug}\u0000${row.ordem}\u0000${row.pergunta}`); return { line: row.line, deck: row.deck.join("::"), ordem: row.ordem, pergunta: row.pergunta, structure_id: deck?.structureKey ? structurePlan.nodes.find((node) => node.key === deck.structureKey)?.existingId ?? null : null, status: deck?.error ? "erro" : duplicate ? "duplicada" : "nova", motivo: deck?.error ?? null }; });
  const structurePreview = structurePlan.nodes.map((node) => ({ path: node.path, tipo: node.tipo, status: node.existingId === null ? "nova" : "existente" }));
  const errors = importDiagnostics(parsed.issues, items); return { law, slug: slugCheck, total: rows.length, issues: parsed.issues, errors, items, structure: { items: structurePreview, existentes: structurePreview.filter((node) => node.status === "existente").length, novas: structurePreview.filter((node) => node.status === "nova").length }, summary: { novas: items.filter(x => x.status === "nova").length, duplicadas: items.filter(x => x.status === "duplicada").length, erros: errors.length } };
}

/** Etapa A: leitura e prévia APKG. Deliberadamente não cria estrutura nem grava questões. */
export async function previewApkgImport(lawSlugValue: unknown, file: File) {
  await requireAdmin();
  const lawSlug = slug(lawSlugValue); const staging = usesUnifiedStagingQuestions(lawSlug);
  const law = staging ? await stagingLaw(lawSlug) : await activeMainLaw(lawSlug);
  if (!file.name.toLowerCase().endsWith(".apkg") || !file.size || file.size > 100_000_000) throw new AdminQuestoesError(400, "Arquivo APKG inválido ou grande demais.");
  let parsed;
  try { parsed = await parseLegisApkg(new Uint8Array(await file.arrayBuffer())); }
  catch (error) { throw new AdminQuestoesError(400, error instanceof Error ? error.message : "APKG inválido."); }
  if (!parsed.rows.length && parsed.unrecognizedModels.length) throw new AdminQuestoesError(422, `Modelo Anki não reconhecido: ${parsed.unrecognizedModels.map((model) => model.name).join(", ")}.`);
  if (parsed.media.some((media) => media.referenced)) throw new AdminQuestoesError(422, "O APKG possui mídia referenciada. O suporte a mídia ainda não faz parte desta etapa.");
  const slugCheck = validateImportSlug(parsed.rows, law.slug);
  if (!slugCheck.valid) throw new AdminQuestoesError(422, slugCheck.message ?? "O arquivo não corresponde à legislação selecionada.");
  const rows = rowsWithEffectiveSlug(parsed.rows, law.slug);
  const questionLaw = staging ? null : await findQuestionLaw(law.slug);
  const structure = staging ? await unifiedStructure(law.id) as QuestionStructureNode[] : questionLaw ? await structureForLaw(questionLaw.id) : [];
  const structurePlan = planQuestionDeckStructure(rows, structure); const decksByLine = new Map(structurePlan.decks.map((deck) => [deck.line, deck]));
  const existing = staging ? { data: (await unifiedQuestions(law.id)).map((question) => ({ pergunta: question.pergunta, slug: question.slug, ordem: question.ordem })), error: null } : questionLaw ? await supabaseQuestoes.from("questions").select("pergunta,slug,ordem").eq("law_id", questionLaw.id) : { data: [], error: null };
  if (existing.error) safeDatabaseError("previsualizar_apkg", existing.error);
  const known = new Set((existing.data ?? []).map((item) => `${item.slug}\u0000${item.ordem}\u0000${item.pergunta}`));
  const items = rows.map((row) => { const deck = decksByLine.get(row.line); const duplicate = known.has(`${row.slug}\u0000${row.ordem}\u0000${row.pergunta}`); return { line: row.line, deck: row.deck.join("::"), ordem: row.ordem, pergunta: row.pergunta, status: deck?.error ? "erro" : duplicate ? "duplicada" : "nova", motivo: deck?.error ?? null }; });
  const structurePreview = structurePlan.nodes.map((node) => ({ path: node.path, tipo: node.tipo, status: node.existingId === null ? "nova" : "existente" }));
  const errors = importDiagnostics(parsed.issues as ImportIssue[], items); return { law, slug: slugCheck, total: rows.length, issues: parsed.issues as ImportIssue[], errors, items, structure: { items: structurePreview, existentes: structurePreview.filter((node) => node.status === "existente").length, novas: structurePreview.filter((node) => node.status === "nova").length }, summary: { novas: items.filter((item) => item.status === "nova").length, duplicadas: items.filter((item) => item.status === "duplicada").length, erros: errors.length }, apkg: { rootDecks: parsed.rootDecks ?? [], subdecks: parsed.subdecks ?? [], notes: parsed.notes ?? 0, cards: parsed.cards ?? 0, recognizedModels: parsed.recognizedModels ?? [], unrecognizedModels: parsed.unrecognizedModels ?? [], media: parsed.media ?? [], tags: parsed.tags ?? [], samples: rows.slice(0, 5) } };
}

type ImportPreview = { slug: { valid: boolean; message: string | null }; issues: unknown[]; items: Array<{ line: number; status: string }>; summary: { duplicadas: number } };

async function persistImportedQuestions(lawSlug: string, originalRows: ImportedQuestion[], preview: ImportPreview, ignored = 0) {
  if (!preview.slug.valid || preview.issues.length || preview.items.some((item) => item.status === "erro")) throw new AdminQuestoesError(422, preview.slug.message ?? "A importação possui linhas inválidas ou estruturas não encontradas.");
  if (usesUnifiedStagingQuestions(lawSlug)) {
    const law = await stagingLaw(lawSlug); const items = new Map(preview.items.map((item) => [item.line, item])); const rowsWithSlug = rowsWithEffectiveSlug(originalRows, law.slug); const newRows = rowsWithSlug.filter((row) => items.get(row.line)?.status === "nova");
    const before = await unifiedStructure(law.id) as QuestionStructureNode[]; const plan = planQuestionDeckStructure(newRows, before);
    const created = plan.nodes.filter((node) => node.existingId === null).length;
    if (!newRows.length) return { lidas: originalRows.length, importadas: 0, duplicadas: preview.summary.duplicadas, ignoradas: ignored, erros: 0, estruturas_criadas: 0, estruturas_reutilizadas: before.length };
    const inserted = await withUnifiedStagingClient(async (client) => {
      await client.query("begin");
      try {
        const ids = new Map(plan.nodes.filter((node) => node.existingId !== null).map((node) => [node.key, node.existingId!]));
        for (const node of plan.nodes) { if (ids.has(node.key)) continue; const parentId = node.parentKey ? ids.get(node.parentKey) : null; if (node.parentKey && !parentId) throw new AdminQuestoesError(422, "Estrutura pai não pôde ser criada."); const createdNode = await client.query("insert into public.law_structure (lei_id,parent_id,tipo,nome,ordem,ativo) values ($1,$2,$3,$4,0,true) returning id::int as id", [law.id, parentId, node.tipo, node.nome]); ids.set(node.key, createdNode.rows[0].id); }
        const structureIds = new Map(plan.decks.map((deck) => [deck.line, deck.structureKey ? ids.get(deck.structureKey) ?? null : null]));
        let count = 0; for (const row of newRows) { await client.query("insert into public.questions (lei_id,structure_id,pergunta,resposta,justificativa,assunto,legislacao,ordem,titulo,total_artigos,slug,ultima_alteracao_legislativa,ativo) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,true)", [law.id, structureIds.get(row.line) ?? null, row.pergunta, row.resposta, row.justificativa || null, row.assunto || null, row.legislacao || null, row.ordem, row.titulo || null, /^\d+$/.test(row.total_artigos) ? Number(row.total_artigos) : null, row.slug, row.ultima_alteracao_legislativa || null]); count++; }
        await client.query("commit"); return count;
      } catch (error) { await client.query("rollback"); throw error; }
    });
    return { lidas: originalRows.length, importadas: inserted, duplicadas: preview.summary.duplicadas, ignoradas: ignored, erros: 0, estruturas_criadas: created, estruturas_reutilizadas: plan.nodes.length - created };
  }
  const law = await activeMainLaw(lawSlug); const questionLaw = await ensureQuestionLaw(law); const items = new Map(preview.items.map((item) => [item.line, item])); const rowsWithSlug = rowsWithEffectiveSlug(originalRows, law.slug); const newRows = rowsWithSlug.filter((row) => items.get(row.line)?.status === "nova");
  const before = await structureForLaw(questionLaw.id); const plan = planQuestionDeckStructure(newRows, before); const created = plan.nodes.filter((node) => node.existingId === null).length;
  if (!newRows.length) return { lidas: originalRows.length, importadas: 0, duplicadas: preview.summary.duplicadas, ignoradas: ignored, erros: 0, estruturas_criadas: 0, estruturas_reutilizadas: before.length };
  const structureIds = await createImportStructure(questionLaw.id, newRows);
  const rows = newRows.map((row) => ({ law_id: questionLaw.id, structure_id: structureIds.get(row.line) ?? null, pergunta: row.pergunta, resposta: row.resposta, justificativa: row.justificativa || null, assunto: row.assunto || null, legislacao: row.legislacao || null, ordem: row.ordem, titulo: row.titulo || null, total_artigos: /^\d+$/.test(row.total_artigos) ? Number(row.total_artigos) : null, slug: row.slug, ultima_alteracao_legislativa: row.ultima_alteracao_legislativa || null, ativo: true }));
  const inserted = await supabaseQuestoes.from("questions").insert(rows).select("id"); if (inserted.error) safeDatabaseError("importar_anki", inserted.error);
  return { lidas: originalRows.length, importadas: inserted.data?.length ?? 0, duplicadas: preview.summary.duplicadas, ignoradas: ignored, erros: 0, estruturas_criadas: created, estruturas_reutilizadas: plan.nodes.length - created };
}

export async function importAnkiTxt(body: Record<string, unknown>) {
  await requireAdmin(); const preview = await previewAnkiImport(body); const parsed = parseAnkiTxt(String(body.text));
  return persistImportedQuestions(slug(body.law_slug), parsed.rows, preview);
}

export async function importApkg(body: { lawSlug: unknown; file: File }) {
  await requireAdmin();
  const lawSlug = slug(body.lawSlug);
  if (!body.file.name.toLowerCase().endsWith(".apkg") || !body.file.size || body.file.size > 100_000_000) throw new AdminQuestoesError(400, "Arquivo APKG inválido ou grande demais.");
  let parsed; try { parsed = await parseLegisApkg(new Uint8Array(await body.file.arrayBuffer())); } catch (error) { throw new AdminQuestoesError(400, error instanceof Error ? error.message : "APKG inválido."); }
  if (parsed.media.some((media) => media.referenced)) throw new AdminQuestoesError(422, "O APKG possui mídia referenciada. O suporte a mídia ainda não faz parte desta etapa.");
  // Reexecuta toda a prévia no servidor: slug, origem híbrida, duplicidade e estrutura.
  const preview = await previewApkgImport(lawSlug, body.file);
  const ignored = parsed.unrecognizedModels.reduce((total, model) => total + model.notes, 0);
  return persistImportedQuestions(lawSlug, parsed.rows, preview, ignored);
}
