import { legisBotOrderCandidates } from "@/lib/legisbot/order-candidates";
import { parseQuestionOrder } from "@/lib/question-structure-consistency";

export type PreviewReferenceRow = { id: string; slug: string; ordem: string; identificacao: string; legislacao: string | null; situacao: "pendente" | "preparada" | "revogada"; lei_revogadora: string | null };
export type PreviewQuestionRow = { id: string; ordem: string; assunto: string | null };
export type PreviewInventoryRow = { ordem: string; identificacao: string; legislacao: string };
export type AdministrativePreviewItem = { id: string | null; slug: string; ordem: string; identification: string; legislation: string | null; status: "prepared" | "pending" | "revoked"; revokingLaw: string | null; questionCount: number; pendingQuestionCount: number; questionIds: string[]; editable: boolean };
export type AdministrativeShadowArticle = { ordem: string; identification: string };

function key(slug: string, ordem: string) { return `${slug.trim().toLowerCase()}\u0000${ordem.trim()}`; }

export function buildAdministrativePreviewItems(lawSlug: string, references: PreviewReferenceRow[], questions: PreviewQuestionRow[]) {
  const items = new Map<string, AdministrativePreviewItem>();
  for (const row of references) {
    // Referência sem texto é apenas um vestígio de descoberta por questão, não
    // um dispositivo legislativo que possa ser mostrado na leitura.
    if (!row.legislacao?.trim()) continue;
    const ordem = row.ordem.trim();
    const status = row.situacao === "revogada" ? "revoked" : "prepared";
    items.set(key(row.slug, ordem), { id: row.id, slug: row.slug.toLowerCase(), ordem, identification: row.identificacao, legislation: row.legislacao, status, revokingLaw: row.lei_revogadora?.trim() || null, questionCount: 0, pendingQuestionCount: 0, questionIds: [], editable: true });
  }
  // Incisos e alíneas pertencem à leitura do artigo/parágrafo superior já
  // preparado. Mesmo que um recorte de questão tenha criado uma referência com
  // texto, ele não vira bloco ou artigo sombra independente nesta prévia.
  // O registro é preservado no banco e suas questões são contadas no superior.
  const coveredBy = new Map<string, string>();
  for (const item of [...items.values()]) {
    const parsed = parseQuestionOrder(item.ordem);
    if (!parsed || (!parsed.inciso && !parsed.letraInciso)) continue;
    const parentKey = legisBotOrderCandidates(item.ordem).slice(1)
      .map((candidate) => key(lawSlug, candidate))
      .find((candidate) => items.get(candidate)?.status === "prepared");
    if (parentKey) { coveredBy.set(key(item.slug, item.ordem), parentKey); items.delete(key(item.slug, item.ordem)); }
  }
  let unresolvedQuestionCount = 0;
  const orphanQuestions: PreviewQuestionRow[] = [];
  for (const question of questions) {
    const ordem = question.ordem.trim();
    if (!parseQuestionOrder(ordem)) { unresolvedQuestionCount += 1; orphanQuestions.push(question); continue; }
    const itemKey = key(lawSlug, ordem);
    let item = items.get(coveredBy.get(itemKey) ?? itemKey);
    if (!item) {
      const parsed = parseQuestionOrder(ordem);
      const parentKey = parsed && (parsed.inciso || parsed.letraInciso)
        ? legisBotOrderCandidates(ordem).slice(1).map((candidate) => key(lawSlug, candidate)).find((candidate) => items.get(candidate)?.status === "prepared")
        : undefined;
      if (parentKey) item = items.get(parentKey);
    }
    if (!item) continue;
    item.questionCount += 1;
    item.questionIds.push(question.id);
  }
  return { items: [...items.values()].sort((left, right) => left.ordem.localeCompare(right.ordem)), unresolvedQuestionCount, orphanQuestions };
}

/** Official inventory minus references that actually contain legal text. */
export function findAdministrativeShadowArticles(inventory: PreviewInventoryRow[], references: PreviewReferenceRow[]): AdministrativeShadowArticle[] {
  const preparedOrders = new Set(references.filter((reference) => Boolean(reference.legislacao?.trim())).map((reference) => reference.ordem.trim()));
  return inventory
    .filter((reference) => !preparedOrders.has(reference.ordem.trim()))
    .map((reference) => ({ ordem: reference.ordem.trim(), identification: reference.identificacao }))
    .sort((left, right) => left.ordem.localeCompare(right.ordem));
}
