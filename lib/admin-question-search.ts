export const ADMIN_QUESTION_SEARCH_LIMIT = 30;
export const ADMIN_QUESTION_SEARCH_MAX_LIMIT = 50;

export type AdminQuestionSearchFilter = "all" | "certo" | "errado" | "unstructured";

export function normalizeAdminQuestionSearchQuery(value: unknown) {
  return String(value ?? "")
    .trim()
    .slice(0, 160)
    .replace(/[^\p{L}\p{N}\s./-]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function adminQuestionSearchTerms(value: unknown) {
  return normalizeAdminQuestionSearchQuery(value).split(" ").filter((term) => /[\p{L}\p{N}]/u.test(term)).slice(0, 6);
}

export function parseAdminQuestionSearchFilter(value: unknown): AdminQuestionSearchFilter {
  return (["certo", "errado", "unstructured"] as const).includes(value as never) ? value as AdminQuestionSearchFilter : "all";
}

export function plainQuestionText(value: unknown, limit = 320) {
  return String(value ?? "")
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, limit);
}
