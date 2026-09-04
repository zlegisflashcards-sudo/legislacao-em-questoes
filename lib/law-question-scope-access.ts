import { getSupabaseServerClient } from "@/lib/supabase-server";
import { mainQuestions, mainStructure } from "@/lib/questions-main-server";
import { descendantsForScope, questionsInScope } from "@/lib/law-question-scope-resolution";
import { availableLawStudyAccess } from "@/lib/law-question-scope-context";

export { availableLawStudyAccess } from "@/lib/law-question-scope-context";

export type LawStudyContext = {
  recorteId: string | null;
  nome: string;
  questionCount: number;
  structureIds: number[] | null;
  questionIds?: string[];
};

type Release = { produto_id: string | null };
type ProductLaw = { produto_id: string; recorte_id: string | null };
type Scope = { id: string; nome: string };
type BatchRelease = Release & { lei_id: number };
type BatchProductLaw = ProductLaw & { lei_id: number };
type BatchScope = Scope & { lei_id: number };
type StructureLink = { recorte_id: string; structure_id: number };

/**
 * Resolve somente os contextos comerciais que o aluno realmente recebeu.
 * Uma liberação sem produto ou um vínculo de produto sem recorte é lei completa;
 * recortes parciais continuam independentes e nunca são somados como lei completa.
 */
export async function listLawStudyContexts(studentId: string, lawId: number): Promise<LawStudyContext[]> {
  const db = getSupabaseServerClient();
  const releasesResult = await db.from("liberacoes_leis").select("produto_id").eq("aluno_id", studentId).eq("lei_id", lawId).eq("status", "ativo");
  if (releasesResult.error) throw new Error(`Não foi possível verificar os contextos de estudo: ${releasesResult.error.message}`);
  const releases = (releasesResult.data ?? []) as Release[];
  const productIds = [...new Set(releases.flatMap((release) => typeof release.produto_id === "string" ? [release.produto_id] : []))];
  const productLinksResult = productIds.length
    ? await db.from("produto_leis").select("produto_id,recorte_id").eq("lei_id", lawId).in("produto_id", productIds)
    : { data: [] as ProductLaw[], error: null };
  if (productLinksResult.error) throw new Error(`Não foi possível verificar os contextos de estudo: ${productLinksResult.error.message}`);
  const productLinks = (productLinksResult.data ?? []) as ProductLaw[];
  const access = availableLawStudyAccess(releases, productLinks);
  const fullAccess = access.full;
  const requestedScopeIds = access.recorteIds;
  const scopesResult = requestedScopeIds.length
    ? await db.from("recortes_leis").select("id,nome").eq("lei_id", lawId).eq("ativo", true).in("id", requestedScopeIds)
    : { data: [] as Scope[], error: null };
  if (scopesResult.error) throw new Error(`Não foi possível carregar os recortes liberados: ${scopesResult.error.message}`);
  const scopes = (scopesResult.data ?? []) as Scope[];
  const [questions, structure, scopeLinksResult] = await Promise.all([
    mainQuestions(lawId),
    mainStructure(lawId),
    requestedScopeIds.length ? db.from("recortes_leis_estrutura").select("recorte_id,structure_id").in("recorte_id", scopes.map((scope) => scope.id)) : Promise.resolve({ data: [] as Array<{ recorte_id: string; structure_id: number }>, error: null }),
  ]);
  if (scopeLinksResult.error) throw new Error(`Não foi possível carregar a estrutura dos recortes liberados: ${scopeLinksResult.error.message}`);
  const linksByScope = new Map<string, number[]>();
  for (const link of scopeLinksResult.data ?? []) linksByScope.set(link.recorte_id, [...(linksByScope.get(link.recorte_id) ?? []), link.structure_id]);
  const contexts: LawStudyContext[] = fullAccess ? [{ recorteId: null, nome: "Lei completa", questionCount: questions.length, structureIds: null, questionIds: questions.map((question) => question.id) }] : [];
  for (const scope of scopes) {
    const selected = linksByScope.get(scope.id) ?? [];
    const structureIds = descendantsForScope(structure, selected);
    const scopedQuestions = questionsInScope(questions, structureIds);
    contexts.push({ recorteId: scope.id, nome: scope.nome, questionCount: scopedQuestions.length, structureIds, questionIds: scopedQuestions.map((question) => question.id) });
  }
  return contexts;
}

/**
 * Resolve os contextos de todas as leis visíveis em consultas agrupadas. A lista
 * do aluno precisa mostrar a quantidade própria de cada recorte sem transformar
 * cada card em uma nova consulta ao banco.
 */
export async function listLawStudyContextsByLaw(studentId: string, lawIds: number[]) {
  const uniqueLawIds = [...new Set(lawIds)];
  const contextsByLaw = new Map<number, LawStudyContext[]>(uniqueLawIds.map((lawId) => [lawId, []]));
  if (!uniqueLawIds.length) return contextsByLaw;
  const db = getSupabaseServerClient();
  const releasesResult = await db.from("liberacoes_leis").select("lei_id,produto_id").eq("aluno_id", studentId).eq("status", "ativo").in("lei_id", uniqueLawIds);
  if (releasesResult.error) throw new Error(`Não foi possível verificar os contextos de estudo: ${releasesResult.error.message}`);
  const releases = (releasesResult.data ?? []) as BatchRelease[];
  const productIds = [...new Set(releases.flatMap((item) => typeof item.produto_id === "string" ? [item.produto_id] : []))];
  const linksResult = productIds.length ? await db.from("produto_leis").select("lei_id,produto_id,recorte_id").in("produto_id", productIds).in("lei_id", uniqueLawIds) : { data: [] as BatchProductLaw[], error: null };
  if (linksResult.error) throw new Error(`Não foi possível verificar os contextos de estudo: ${linksResult.error.message}`);
  const links = (linksResult.data ?? []) as BatchProductLaw[];
  const scopeIds = [...new Set(links.flatMap((link) => typeof link.recorte_id === "string" ? [link.recorte_id] : []))];
  const activeScopesResult = scopeIds.length ? await db.from("recortes_leis").select("id,lei_id,nome").eq("ativo", true).in("id", scopeIds).order("nome") : { data: [] as BatchScope[], error: null };
  if (activeScopesResult.error) throw new Error(`Não foi possível carregar os recortes liberados: ${activeScopesResult.error.message}`);
  const scopes = (activeScopesResult.data ?? []) as BatchScope[];
  const activeScopeIds = new Set(scopes.map((scope) => scope.id));
  const [questionsResult, structureResult, scopeLinksResult] = await Promise.all([
    db.from("questions").select("id,lei_id,structure_id").in("lei_id", uniqueLawIds).eq("ativo", true),
    db.from("law_structure").select("id,lei_id,parent_id").in("lei_id", uniqueLawIds).eq("ativo", true),
    activeScopeIds.size ? db.from("recortes_leis_estrutura").select("recorte_id,structure_id").in("recorte_id", [...activeScopeIds]) : Promise.resolve({ data: [] as StructureLink[], error: null }),
  ]);
  if (questionsResult.error) throw new Error(`Não foi possível carregar as questões dos contextos de estudo: ${questionsResult.error.message}`);
  if (structureResult.error) throw new Error(`Não foi possível carregar a estrutura dos contextos de estudo: ${structureResult.error.message}`);
  if (scopeLinksResult.error) throw new Error(`Não foi possível carregar a estrutura dos recortes liberados: ${scopeLinksResult.error.message}`);
  const questionsByLaw = new Map<number, Array<{ id: string; structure_id: number | null }>>();
  for (const question of questionsResult.data ?? []) questionsByLaw.set(question.lei_id, [...(questionsByLaw.get(question.lei_id) ?? []), question]);
  const structureByLaw = new Map<number, Array<{ id: number; parent_id: number | null }>>();
  for (const node of structureResult.data ?? []) structureByLaw.set(node.lei_id, [...(structureByLaw.get(node.lei_id) ?? []), node]);
  const linksByLaw = new Map<number, BatchProductLaw[]>();
  for (const link of links) linksByLaw.set(link.lei_id, [...(linksByLaw.get(link.lei_id) ?? []), link]);
  const scopeLinksById = new Map<string, number[]>();
  for (const link of (scopeLinksResult.data ?? []) as StructureLink[]) scopeLinksById.set(link.recorte_id, [...(scopeLinksById.get(link.recorte_id) ?? []), link.structure_id]);
  const scopesByLaw = new Map<number, BatchScope[]>();
  for (const scope of scopes) scopesByLaw.set(scope.lei_id, [...(scopesByLaw.get(scope.lei_id) ?? []), scope]);
  for (const lawId of uniqueLawIds) {
    const releasesForLaw = releases.filter((release) => release.lei_id === lawId);
    const productLinks = linksByLaw.get(lawId) ?? [];
    const access = availableLawStudyAccess(releasesForLaw, productLinks);
    const questions = questionsByLaw.get(lawId) ?? [];
    const structure = structureByLaw.get(lawId) ?? [];
    const contexts: LawStudyContext[] = access.full ? [{ recorteId: null, nome: "Lei completa", questionCount: questions.length, structureIds: null, questionIds: questions.map((question) => question.id) }] : [];
    for (const scope of scopesByLaw.get(lawId) ?? []) {
      if (!access.recorteIds.includes(scope.id)) continue;
      const structureIds = descendantsForScope(structure, scopeLinksById.get(scope.id) ?? []);
      const scopedQuestions = questionsInScope(questions, structureIds);
      contexts.push({ recorteId: scope.id, nome: scope.nome, questionCount: scopedQuestions.length, structureIds, questionIds: scopedQuestions.map((question) => question.id) });
    }
    contextsByLaw.set(lawId, contexts);
  }
  return contextsByLaw;
}

/** Compatibilidade para consumidores que precisam apenas da quantidade de contextos. */
export async function countLawStudyContexts(studentId: string, lawIds: number[]) {
  const contextsByLaw = await listLawStudyContextsByLaw(studentId, lawIds);
  return new Map([...contextsByLaw].map(([lawId, contexts]) => [lawId, contexts.length]));
}
