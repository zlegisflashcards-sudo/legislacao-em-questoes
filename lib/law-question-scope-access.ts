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
};

type Release = { produto_id: string | null };
type ProductLaw = { produto_id: string; recorte_id: string | null };
type Scope = { id: string; nome: string };

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
  const contexts: LawStudyContext[] = fullAccess ? [{ recorteId: null, nome: "Lei completa", questionCount: questions.length, structureIds: null }] : [];
  for (const scope of scopes) {
    const selected = linksByScope.get(scope.id) ?? [];
    const structureIds = descendantsForScope(structure, selected);
    contexts.push({ recorteId: scope.id, nome: scope.nome, questionCount: questionsInScope(questions, structureIds).length, structureIds });
  }
  return contexts;
}

/** Consulta em lote usada pela lista: não conta questões, apenas contextos únicos. */
export async function countLawStudyContexts(studentId: string, lawIds: number[]) {
  const uniqueLawIds = [...new Set(lawIds)];
  const counts = new Map(uniqueLawIds.map((lawId) => [lawId, 0]));
  if (!uniqueLawIds.length) return counts;
  const db = getSupabaseServerClient();
  const releasesResult = await db.from("liberacoes_leis").select("lei_id,produto_id").eq("aluno_id", studentId).eq("status", "ativo").in("lei_id", uniqueLawIds);
  if (releasesResult.error) throw new Error(`Não foi possível verificar os contextos de estudo: ${releasesResult.error.message}`);
  const releases = releasesResult.data ?? [];
  const productIds = [...new Set(releases.flatMap((item) => typeof item.produto_id === "string" ? [item.produto_id] : []))];
  const linksResult = productIds.length ? await db.from("produto_leis").select("lei_id,recorte_id").in("produto_id", productIds).in("lei_id", uniqueLawIds) : { data: [], error: null };
  if (linksResult.error) throw new Error(`Não foi possível verificar os contextos de estudo: ${linksResult.error.message}`);
  const linksByLaw = new Map<number, Array<{ recorte_id: string | null }>>();
  for (const link of linksResult.data ?? []) linksByLaw.set(link.lei_id, [...(linksByLaw.get(link.lei_id) ?? []), { recorte_id: link.recorte_id }]);
  const scopeIds = [...new Set((linksResult.data ?? []).flatMap((link) => typeof link.recorte_id === "string" ? [link.recorte_id] : []))];
  const activeScopesResult = scopeIds.length ? await db.from("recortes_leis").select("id").eq("ativo", true).in("id", scopeIds) : { data: [], error: null };
  if (activeScopesResult.error) throw new Error(`Não foi possível carregar os recortes liberados: ${activeScopesResult.error.message}`);
  const activeScopeIds = new Set((activeScopesResult.data ?? []).map((scope) => scope.id));
  for (const lawId of uniqueLawIds) {
    const full = releases.some((release) => release.lei_id === lawId && release.produto_id === null) || (linksByLaw.get(lawId) ?? []).some((link) => link.recorte_id === null);
    const scopeCount = new Set((linksByLaw.get(lawId) ?? []).flatMap((link) => link.recorte_id && activeScopeIds.has(link.recorte_id) ? [link.recorte_id] : [])).size;
    counts.set(lawId, (full ? 1 : 0) + scopeCount);
  }
  return counts;
}
