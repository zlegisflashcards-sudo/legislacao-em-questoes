export type StandardizationField = "assunto" | "ordem" | "legislacao";

export function standardizationContextOrder(originalOrder: string, nextOrder: string, applied: StandardizationField[]) {
  return applied.includes("ordem") && nextOrder.trim() ? nextOrder.trim() : originalOrder;
}

export function shouldNavigateToStandardizedOrder(originalOrder: string, nextOrder: string, applied: StandardizationField[]) {
  return standardizationContextOrder(originalOrder, nextOrder, applied) !== originalOrder;
}
