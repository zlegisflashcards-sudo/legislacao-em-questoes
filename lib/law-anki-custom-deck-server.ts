import "server-only";
import { buildLawApkg } from "@/lib/anki-apkg-export";
import { authorizeLawQuestionScope } from "@/lib/law-question-scope-auth";
import { descendantsForScope, normalizeScopeSelection } from "@/lib/law-question-scope-resolution";
import { resolveQuestionsForLawScope } from "@/lib/law-question-scopes";
import { reviewState } from "@/lib/law-review-server";
import { LawStudyApiError } from "@/lib/law-study-server";
import { mainStructure } from "@/lib/questions-main-server";

export type CustomDeckFilter = "all" | "errors" | "favorites" | "unanswered";
type Input = { includedStructureIds: number[]; excludedStructureIds: number[]; filter: CustomDeckFilter };
const filters = new Set<CustomDeckFilter>(["all", "errors", "favorites", "unanswered"]);
function ids(value: unknown) { if (!Array.isArray(value) || value.some((id) => !Number.isSafeInteger(id) || id < 1)) throw new LawStudyApiError(400, "Seleção estrutural inválida."); return [...new Set(value as number[])]; }
export function parseCustomDeckInput(value: unknown): Input { if (!value || typeof value !== "object" || Array.isArray(value)) throw new LawStudyApiError(400, "Personalização inválida."); const item = value as Record<string, unknown>; const filter = item.filter; if (typeof filter !== "string" || !filters.has(filter as CustomDeckFilter)) throw new LawStudyApiError(400, "Filtro inválido."); return { includedStructureIds: ids(item.includedStructureIds), excludedStructureIds: ids(item.excludedStructureIds), filter: filter as CustomDeckFilter }; }

export async function resolveCustomDeck(request: Request, slug: string, body: unknown) {
  const input = parseCustomDeckInput(body); const context = await authorizeLawQuestionScope(request, slug, new URL(request.url).searchParams.get("recorte_id"));
  const [structure, scopedQuestions] = await Promise.all([mainStructure(context.lawId), resolveQuestionsForLawScope(context.lawId, context.recorte?.id ?? null)]);
  // O escopo autorizado é a fonte final: para recortes, derive nós e ancestrais
  // das próprias questões e nunca aceite estruturas fora desse universo.
  const questionStructureIds = new Set(scopedQuestions.flatMap((question) => question.structure_id === null ? [] : [question.structure_id]));
  const byId = new Map(structure.map((node) => [node.id, node])); const allowedTreeIds = new Set(questionStructureIds);
  for (const id of questionStructureIds) for (let node = byId.get(id); node?.parent_id !== null && node?.parent_id !== undefined; node = byId.get(node.parent_id)) allowedTreeIds.add(node.parent_id);
  const allowedNodes = context.recorte ? structure.filter((node) => allowedTreeIds.has(node.id)) : structure;
  const allowedIds = new Set(allowedNodes.map((node) => node.id));
  for (const id of [...input.includedStructureIds, ...input.excludedStructureIds]) if (!allowedIds.has(id)) throw new LawStudyApiError(403, "A seleção contém uma estrutura fora do conteúdo liberado.");
  const included = normalizeScopeSelection(structure, input.includedStructureIds); const excluded = normalizeScopeSelection(structure, input.excludedStructureIds);
  const selected = new Set(descendantsForScope(structure, included)); for (const id of descendantsForScope(structure, excluded)) selected.delete(id);
  let filterIds: Set<string> | null = null;
  if (input.filter === "errors" || input.filter === "favorites") filterIds = new Set((await reviewState(request, slug, input.filter)).questions?.map((q) => q.id) ?? []);
  if (input.filter === "unanswered") {
    const campaigns = await context.supabase.from("campanhas_leis_alunos").select("id").eq("aluno_id", context.studentId).eq("lei_id", context.lawId);
    if (campaigns.error) throw new LawStudyApiError(503, "Não foi possível consultar seu histórico.");
    const campaignIds = (campaigns.data ?? []).flatMap((item) => typeof item.id === "string" ? [item.id] : []);
    const answers = campaignIds.length ? await context.supabase.from("campanhas_leis_respostas").select("questao_id").in("campanha_id", campaignIds) : { data: [], error: null };
    if (answers.error) throw new LawStudyApiError(503, "Não foi possível consultar seu histórico.");
    const answered = new Set((answers.data ?? []).flatMap((item) => typeof item.questao_id === "string" ? [item.questao_id] : [])); filterIds = new Set(scopedQuestions.filter((question) => !answered.has(question.id)).map((question) => question.id));
  }
  const questions = scopedQuestions.filter((question) => question.structure_id !== null && selected.has(question.structure_id) && (!filterIds || filterIds.has(question.id)));
  return { context, structure: allowedNodes, questions, selectedStructureIds: [...selected], unstructuredCount: scopedQuestions.filter((q) => q.structure_id === null).length, input };
}
export async function previewCustomDeck(request: Request, slug: string, body: unknown) { const result = await resolveCustomDeck(request, slug, body); return { law: { title: result.context.title }, recorte: result.context.recorte, structure: result.structure, count: result.questions.length, unstructuredCount: result.unstructuredCount }; }
export async function downloadCustomDeck(request: Request, slug: string, body: unknown) { const result = await resolveCustomDeck(request, slug, body); if (!result.questions.length) throw new LawStudyApiError(422, "Nenhum flashcard elegível foi selecionado."); const exported = await buildLawApkg({ slug, titulo: result.context.title }, result.questions, result.structure); const bytes = exported.bytes.buffer.slice(exported.bytes.byteOffset, exported.bytes.byteOffset + exported.bytes.byteLength) as ArrayBuffer; return new Response(bytes, { headers: { "Cache-Control": "private, no-store, max-age=0", "Content-Type": "application/vnd.anki", "Content-Disposition": `attachment; filename="${exported.filename}"`, "X-Content-Type-Options": "nosniff" } }); }
