import { matchesStudentTags } from "@/lib/student-center-tags";
export type StudentCenterFilterRow = { primeiro_acesso_em: string | null; ultimo_acesso_em: string | null; lastStudy: string | null; products: number; laws: string[]; productIds: string[]; purchaseDates: string[]; origin: string | null; postSalePending: boolean; postSaleStatus: string; tagIds?:number[] };
export type StudentCenterFilters = { quick: string; origin: string; lawId: string; productId: string; access: string; commercial: string; purchasePeriod: string; purchaseStart: string; purchaseEnd: string; study: string; postSale: string; tagIds?:number[] };

export function matchesStudentCenterFilters(row: StudentCenterFilterRow, filters: StudentCenterFilters, now = Date.now()) {
  if (!matchesStudentTags(row.tagIds, filters.tagIds)) return false;
  if (filters.origin && row.origin !== filters.origin) return false;
  if (filters.lawId && !row.laws.includes(filters.lawId)) return false;
  if (filters.productId && !row.productIds.includes(filters.productId)) return false;
  if (filters.access === "without_access" && row.laws.length) return false;
  if (filters.access === "released" && !row.laws.length) return false;
  if (filters.access === "never_accessed" && row.primeiro_acesso_em) return false;
  if (filters.access === "accessed" && !row.primeiro_acesso_em) return false;
  if (filters.commercial === "with_product" && !row.products) return false;
  if (filters.commercial === "without_product" && row.products) return false;
  const periodDays = filters.purchasePeriod === "today" ? 1 : filters.purchasePeriod === "7d" ? 7 : filters.purchasePeriod === "30d" ? 30 : 0;
  if (periodDays && !row.purchaseDates.some((date) => Date.parse(date) >= now - periodDays * 86400000)) return false;
  if (filters.purchasePeriod === "custom" && !row.purchaseDates.some((date) => (!filters.purchaseStart || date >= `${filters.purchaseStart}T00:00:00`) && (!filters.purchaseEnd || date <= `${filters.purchaseEnd}T23:59:59.999Z`))) return false;
  if (filters.study === "recent" && (!row.lastStudy || Date.parse(row.lastStudy) < now - 7 * 86400000)) return false;
  if (filters.study === "inactive" && row.lastStudy && Date.parse(row.lastStudy) >= now - 7 * 86400000) return false;
  if (filters.postSale === "pending" && row.postSaleStatus !== "pending") return false;
  if (filters.postSale === "done" && row.postSaleStatus !== "done") return false;
  if (filters.quick === "never_accessed") return !row.primeiro_acesso_em;
  if (filters.quick === "without_product") return row.products === 0 && row.laws.length === 0;
  if (filters.quick === "bought_never_used") return row.products > 0 && !row.primeiro_acesso_em;
  if (filters.quick === "recent_access") return Boolean(row.ultimo_acesso_em && Date.parse(row.ultimo_acesso_em) >= now - 7 * 86400000);
  if (filters.quick === "post_sale") return row.postSalePending;
  return true;
}
