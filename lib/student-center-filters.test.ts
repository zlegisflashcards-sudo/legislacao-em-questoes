import { describe, expect, it } from "vitest";
import { matchesStudentCenterFilters } from "@/lib/student-center-filters";

describe("filtros cumulativos da Central do Aluno", () => {
  const row = { primeiro_acesso_em: null, ultimo_acesso_em: null, lastStudy: null, products: 1, laws: ["42"], productIds: ["produto-a"], purchaseDates: ["2026-09-27T12:00:00.000Z"], origin: "hotmart", postSalePending: true, postSaleStatus: "pending" };
  const base = { productId: "", access: "all", commercial: "all", purchasePeriod: "", purchaseStart: "", purchaseEnd: "", study: "all", postSale: "all" };
  it("exige simultaneamente filtro rápido, origem e lei", () => {
    expect(matchesStudentCenterFilters(row, { ...base, quick: "never_accessed", origin: "hotmart", lawId: "42" })).toBe(true);
    expect(matchesStudentCenterFilters(row, { ...base, quick: "never_accessed", origin: "administrativo", lawId: "42" })).toBe(false);
    expect(matchesStudentCenterFilters(row, { ...base, quick: "never_accessed", origin: "hotmart", lawId: "99" })).toBe(false);
  });
  it("mantém a fila de pós-venda como filtro independente combinado", () => {
    expect(matchesStudentCenterFilters(row, { ...base, quick: "post_sale", origin: "hotmart", lawId: "42" })).toBe(true);
    expect(matchesStudentCenterFilters({ ...row, postSalePending: false }, { ...base, quick: "post_sale", origin: "hotmart", lawId: "42" })).toBe(false);
  });
  it("distingue pós-venda pendente e feito sem limpar os demais filtros", () => {
    expect(matchesStudentCenterFilters(row, { ...base, quick: "", origin: "hotmart", lawId: "42", postSale: "pending" })).toBe(true);
    expect(matchesStudentCenterFilters(row, { ...base, quick: "", origin: "hotmart", lawId: "42", postSale: "done" })).toBe(false);
    expect(matchesStudentCenterFilters({ ...row, postSaleStatus: "done" }, { ...base, quick: "", origin: "hotmart", lawId: "42", postSale: "done" })).toBe(true);
  });
  it("combina status comercial, produto, período e estudo", () => {
    const now = Date.parse("2026-09-27T13:00:00.000Z");
    expect(matchesStudentCenterFilters({ ...row, lastStudy: "2026-09-27T12:00:00.000Z" }, { quick: "", origin: "hotmart", lawId: "42", productId: "produto-a", access: "never_accessed", commercial: "with_product", purchasePeriod: "today", purchaseStart: "", purchaseEnd: "", study: "recent", postSale: "all" }, now)).toBe(true);
    expect(matchesStudentCenterFilters({ ...row, lastStudy: "2026-09-01T12:00:00.000Z" }, { quick: "", origin: "hotmart", lawId: "42", productId: "produto-a", access: "never_accessed", commercial: "with_product", purchasePeriod: "today", purchaseStart: "", purchaseEnd: "", study: "recent", postSale: "all" }, now)).toBe(false);
  });
});
