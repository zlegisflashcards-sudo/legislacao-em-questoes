import { adminQuestionSearchId, adminQuestionSearchTerms, parseAdminQuestionSearchFilter } from "./admin-question-search";

export type BulkQuestionDeleteScope = "results" | "structure" | "all";

export function bulkDeletionConfirmationText(scope: BulkQuestionDeleteScope) {
  return scope === "all" ? "EXCLUIR LEI INTEIRA" : "EXCLUIR";
}

export function buildBulkQuestionDeletionPayload(input: {
  lawSlug: string;
  scope: BulkQuestionDeleteScope;
  structureId: number | null;
  scopeId: string | null;
  query: string;
  filter: string;
  article: string;
}) {
  const useSearch = input.scope === "results";
  return {
    law_slug: input.lawSlug,
    scope: input.scope,
    structure_id: input.scope === "all" ? null : input.structureId,
    recorte_id: input.scope === "all" ? null : input.scopeId,
    query: useSearch ? input.query.trim() : "",
    filter: useSearch ? parseAdminQuestionSearchFilter(input.filter) : "all",
    article: useSearch ? input.article.trim().slice(0, 80) : "",
  };
}

export function bulkDeletionHasSearchFilters(input: ReturnType<typeof buildBulkQuestionDeletionPayload>) {
  return Boolean(input.structure_id || input.recorte_id || input.article || input.filter !== "all" ||
    adminQuestionSearchId(input.query) || adminQuestionSearchTerms(input.query).length);
}
