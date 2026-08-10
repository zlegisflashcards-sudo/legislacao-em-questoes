import { CommercialValidationError, requiredString } from "./commercial-admin-validation";

export type HistoricalSaleStatus = "ativo" | "cancelado" | "reembolsado";

export function normalizeHistoricalHotmartStatus(value: unknown): HistoricalSaleStatus {
  const status = requiredString(value, "Status", 60).toLocaleLowerCase("pt-BR");
  const statusMap: Record<string, HistoricalSaleStatus> = {
    approved: "ativo", complete: "ativo", aprovada: "ativo", aprovado: "ativo", completa: "ativo", completo: "ativo",
    cancelled: "cancelado", canceled: "cancelado", cancelada: "cancelado", cancelado: "cancelado",
    refunded: "reembolsado", reembolsada: "reembolsado", chargeback: "reembolsado",
  };
  const mappedStatus = statusMap[status];
  if (!mappedStatus) throw new CommercialValidationError("Status Hotmart não suportado.");
  return mappedStatus;
}
