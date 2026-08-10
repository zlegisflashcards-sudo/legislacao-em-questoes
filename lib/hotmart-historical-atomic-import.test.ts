import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { normalizeHistoricalHotmartStatus } from "./historical-import-status";

const server = readFileSync("lib/commercial-admin-server.ts", "utf8");
const migration = readFileSync("supabase/migrations/20260810150000_make_historical_hotmart_import_atomic.sql", "utf8");
const client = readFileSync("components/admin/commercial-admin.tsx", "utf8");

describe("importação histórica Hotmart atômica", () => {
  it("mantém Aprovado e Completo como ativos", () => {
    expect(normalizeHistoricalHotmartStatus("Aprovado")).toBe("ativo");
    expect(normalizeHistoricalHotmartStatus(" Completo ")).toBe("ativo");
  });

  it("centraliza aluno, compra e liberações na mesma RPC transacional", () => {
    expect(migration).toContain("function public.admin_importar_aquisicao_hotmart_historica");
    expect(migration).toContain("insert into public.alunos");
    expect(migration).toContain("insert into public.compras");
    expect(migration).toContain("insert into public.liberacoes_leis");
    expect(migration).toContain("pg_advisory_xact_lock");
    expect(server).toContain('rpc("admin_importar_aquisicao_hotmart_historica"');
    expect(server).not.toContain('rpc("obter_ou_criar_aluno_por_email"');
  });

  it("preserva a idempotência por transação e não dispara primeiro acesso", () => {
    expect(migration).toContain("identificador_externo=pg_catalog.btrim(p_transaction_id)");
    const historical = server.slice(server.indexOf("async function importHistoricalHotmartSales"), server.indexOf("export async function mutateCommercialResource"));
    expect(historical).not.toContain("provisionStudentFirstAccess");
    expect(historical).toContain("imported?.duplicada");
  });

  it("mostra erros administrativos e totais separados", () => {
    expect(server).toContain("Falha não identificada pelo Supabase.");
    expect(server).toContain('"message" in error');
    expect(client).toContain("· Erros:");
    expect(client).toContain("Ver motivos dos erros");
  });
});
