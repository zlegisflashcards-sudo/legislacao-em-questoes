import "server-only";

import { obterAdministrador } from "@/lib/admin-auth";
import { parseQuestionDraft, type QuestionDraft } from "@/lib/admin-questoes";
import { getSupabaseServerClient } from "@/lib/supabase-server";
import { supabaseQuestoes } from "@/lib/supabase-questoes-server";
import { parseAnkiTxt, structureIdForDeck, validateImportSlug } from "@/lib/anki-txt-import";

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
  return result.data ?? [];
}
async function questionLawForSlug(lawSlug: string) { const law = await activeMainLaw(slug(lawSlug)); const questionLaw = await findQuestionLaw(law.slug); if (!questionLaw) throw new AdminQuestoesError(404, "Lei de questões não encontrada."); return { law, questionLaw }; }
function structureType(value: unknown): StructureType { if (typeof value !== "string" || !structureTypes.includes(value as StructureType)) throw new AdminQuestoesError(400, "Tipo estrutural inválido."); return value as StructureType; }
function optionalStructureId(value: unknown) { if (value === null || value === undefined || value === "") return null; const id = Number(value); if (!Number.isSafeInteger(id) || id < 1) throw new AdminQuestoesError(400, "Estrutura inválida."); return id; }
function structureText(value: unknown, label: string, max = 500) { if (typeof value !== "string" || !value.trim() || value.trim().length > max) throw new AdminQuestoesError(400, `${label} inválido.`); return value.trim(); }
async function validateQuestionStructure(questionLawId: string, structureId: number | null) { if (!structureId) return; const result = await supabaseQuestoes.from("law_structure").select("id").eq("id", structureId).eq("law_id", questionLawId).eq("ativo", true).maybeSingle(); if (result.error) safeDatabaseError("validar_estrutura_questao", result.error); if (!result.data) throw new AdminQuestoesError(422, "A estrutura selecionada não pertence à lei ativa."); }

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

export async function listAdminQuestions(lawSlug: string) {
  await requireAdmin();
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

export async function createAdminQuestion(body: Record<string, unknown>) {
  await requireAdmin();
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

export async function createStructureNode(body: Record<string, unknown>) {
  await requireAdmin(); const { questionLaw } = await questionLawForSlug(String(body.law_slug ?? "")); const tipo = structureType(body.tipo); const parentId = optionalStructureId(body.parent_id);
  if (parentId) { const parent = await supabaseQuestoes.from("law_structure").select("law_id,tipo").eq("id", parentId).maybeSingle(); if (parent.error) safeDatabaseError("validar_pai_estrutura", parent.error); if (!parent.data || parent.data.law_id !== questionLaw.id || validParents[tipo] !== parent.data.tipo) throw new AdminQuestoesError(422, "Relação estrutural inválida para esta lei."); }
  else if (validParents[tipo] !== "law" && tipo !== "capitulo") throw new AdminQuestoesError(422, "Este nível exige um nível pai compatível.");
  const result = await supabaseQuestoes.from("law_structure").insert({ law_id: questionLaw.id, parent_id: parentId, tipo, nome: structureText(body.nome, "Nome"), ordem: optionalStructureId(body.ordem) ?? 0, ativo: true }).select().single(); if (result.error) safeDatabaseError("criar_estrutura", result.error); return result.data;
}
export async function updateStructureNode(body: Record<string, unknown>) {
  await requireAdmin(); const { questionLaw } = await questionLawForSlug(String(body.law_slug ?? "")); const id = optionalStructureId(body.id); if (!id) throw new AdminQuestoesError(400, "Estrutura inválida."); const result = await supabaseQuestoes.from("law_structure").update({ nome: structureText(body.nome, "Nome"), ordem: optionalStructureId(body.ordem) ?? 0 }).eq("id", id).eq("law_id", questionLaw.id).eq("ativo", true).select().maybeSingle(); if (result.error) safeDatabaseError("editar_estrutura", result.error); if (!result.data) throw new AdminQuestoesError(404, "Estrutura ativa não encontrada."); return result.data;
}
export async function deactivateStructureNode(body: Record<string, unknown>) {
  await requireAdmin(); const { questionLaw } = await questionLawForSlug(String(body.law_slug ?? "")); const id = optionalStructureId(body.id); if (!id) throw new AdminQuestoesError(400, "Estrutura inválida."); const result = await supabaseQuestoes.from("law_structure").update({ ativo: false }).eq("id", id).eq("law_id", questionLaw.id).eq("ativo", true).select("id").maybeSingle(); if (result.error) safeDatabaseError("desativar_estrutura", result.error); if (!result.data) throw new AdminQuestoesError(404, "Estrutura ativa não encontrada."); return result.data;
}
export async function deleteStructureNode(body: Record<string, unknown>) {
  await requireAdmin(); const { questionLaw } = await questionLawForSlug(String(body.law_slug ?? "")); const id = optionalStructureId(body.id); if (!id) throw new AdminQuestoesError(400, "Estrutura inválida.");
  const [children, questions] = await Promise.all([supabaseQuestoes.from("law_structure").select("id").eq("parent_id", id).limit(1), supabaseQuestoes.from("questions").select("id").eq("structure_id", id).limit(1)]);
  if (children.error || questions.error) safeDatabaseError("verificar_exclusao_estrutura", children.error ?? questions.error);
  if (children.data?.length || questions.data?.length) throw new AdminQuestoesError(422, "A estrutura possui filhos ou questões vinculadas; desative-a em vez de excluir.");
  const result = await supabaseQuestoes.from("law_structure").delete().eq("id", id).eq("law_id", questionLaw.id).select("id").maybeSingle(); if (result.error) safeDatabaseError("excluir_estrutura", result.error); if (!result.data) throw new AdminQuestoesError(404, "Estrutura não encontrada."); return result.data;
}

export async function deactivateAdminQuestion(body: Record<string, unknown>) {
  await requireAdmin();
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
  const law = await activeMainLaw(slug(body.law_slug));
  if (typeof body.text !== "string" || body.text.length > 20_000_000) throw new AdminQuestoesError(400, "Arquivo TXT inválido ou grande demais.");
  let parsed; try { parsed = parseAnkiTxt(body.text); } catch (error) { throw new AdminQuestoesError(400, error instanceof Error ? error.message : "TXT inválido."); }
  const slugCheck = validateImportSlug(parsed.rows, law.slug);
  const questionLaw = await findQuestionLaw(law.slug);
  const structure = questionLaw ? await structureForLaw(questionLaw.id) : [];
  const existing = questionLaw ? await supabaseQuestoes.from("questions").select("pergunta,slug,ordem").eq("law_id", questionLaw.id) : { data: [], error: null };
  if (existing.error) safeDatabaseError("previsualizar_importacao", existing.error);
  const known = new Set((existing.data ?? []).map((x) => `${x.slug}\u0000${x.ordem}\u0000${x.pergunta}`));
  const items = parsed.rows.map((row) => { const structureId = structureIdForDeck(row.deck, structure); const duplicate = known.has(`${row.slug}\u0000${row.ordem}\u0000${row.pergunta}`); return { line: row.line, deck: row.deck.join("::"), structure_id: structureId, status: structureId === null ? "erro" : duplicate ? "duplicada" : "nova", motivo: structureId === null ? "Estrutura não encontrada" : null }; });
  return { law, slug: slugCheck, total: parsed.rows.length, issues: parsed.issues, items, summary: { novas: items.filter(x => x.status === "nova").length, duplicadas: items.filter(x => x.status === "duplicada").length, erros: parsed.issues.length + items.filter(x => x.status === "erro").length } };
}

export async function importAnkiTxt(body: Record<string, unknown>) {
  await requireAdmin(); const preview = await previewAnkiImport(body);
  if (!preview.slug.valid || preview.issues.length || preview.items.some((item) => item.status === "erro")) throw new AdminQuestoesError(422, preview.slug.message ?? "A importação possui linhas inválidas ou estruturas não encontradas.");
  const law = await activeMainLaw(slug(body.law_slug)); const questionLaw = await ensureQuestionLaw(law); const parsed = parseAnkiTxt(String(body.text)); const items = new Map(preview.items.map((item) => [item.line, item]));
  const rows = parsed.rows.filter((row) => items.get(row.line)?.status === "nova").map((row) => ({ law_id: questionLaw.id, structure_id: items.get(row.line)?.structure_id, pergunta: row.pergunta, resposta: row.resposta, justificativa: row.justificativa || null, assunto: row.assunto || null, legislacao: row.legislacao || null, ordem: row.ordem, titulo: row.titulo || null, total_artigos: /^\d+$/.test(row.total_artigos) ? Number(row.total_artigos) : null, slug: row.slug, ultima_alteracao_legislativa: row.ultima_alteracao_legislativa || null, ativo: true }));
  if (!rows.length) return { lidas: parsed.rows.length, importadas: 0, duplicadas: preview.summary.duplicadas, erros: 0 };
  const inserted = await supabaseQuestoes.from("questions").insert(rows).select("id"); if (inserted.error) safeDatabaseError("importar_anki", inserted.error);
  return { lidas: parsed.rows.length, importadas: inserted.data?.length ?? 0, duplicadas: preview.summary.duplicadas, erros: 0 };
}
