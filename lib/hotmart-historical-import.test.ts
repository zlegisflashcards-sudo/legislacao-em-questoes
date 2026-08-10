import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { normalizeHistoricalHotmartStatus } from "./historical-import-status";

describe("status da importação histórica Hotmart", () => {
  it.each(["Aprovado", "aprovado", " APROVADO ", "Completo", "completo", " COMPLETO "])("considera %s uma venda ativa", (status) => {
    expect(normalizeHistoricalHotmartStatus(status)).toBe("ativo");
  });

  it("aceita o arquivo de 9 Aprovado e 61 Completo como 70 vendas ativas", () => {
    const statuses = [...Array.from({ length: 9 }, () => "Aprovado"), ...Array.from({ length: 61 }, () => "Completo")];
    expect(statuses.map(normalizeHistoricalHotmartStatus)).toEqual(Array(70).fill("ativo"));
  });

  it("preserva o ponto de idempotência por origem e transaction id", () => {
    const server = readFileSync("lib/commercial-admin-server.ts", "utf8");
    expect(server).toContain('.eq("origem", "hotmart").eq("identificador_externo", sale.transactionId)');
  });
});
