import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { diagnosticoHottok, normalizarEventoHotmart, registrarEventoHotmart } from "./webhook";

const payload = {
  id: "evt-123",
  event: "PURCHASE_APPROVED",
  buyer: { email: "Aluno@Exemplo.com" },
  product: { id: 987 },
  purchase: { transaction: "HP123", status: "APPROVED" },
};

describe("recepção de webhook Hotmart", () => {
  it("alinha a tabela legada aos campos registrados pelo receptor", () => {
    const migration = readFileSync("supabase/migrations/20260807190000_align_hotmart_eventos_webhook.sql", "utf8");
    for (const field of ["identificador_evento", "codigo_transacao", "tipo_evento", "status_transacao", "email_comprador", "payload_bruto", "payload_normalizado", "recebido_em"]) {
      expect(migration).toContain(`add column if not exists ${field}`);
    }
    expect(migration).toContain("hotmart_eventos_identificador_evento_unique_idx");
  });

  it("expõe apenas presença e tamanhos no diagnóstico do Hottok", () => {
    expect(diagnosticoHottok("segredo-recebido", "segredo-configurado")).toEqual({
      hottokRecebido: true, hottokConfigurado: true, tamanhoRecebido: 16, tamanhoConfigurado: 19,
    });
    expect(diagnosticoHottok(null, undefined)).toEqual({
      hottokRecebido: false, hottokConfigurado: false, tamanhoRecebido: 0, tamanhoConfigurado: 0,
    });
  });

  it("normaliza os campos de um evento novo", () => {
    expect(normalizarEventoHotmart(payload)).toEqual({
      identificador_evento: "evt-123", codigo_transacao: "HP123", hotmart_product_id: "987",
      tipo_evento: "PURCHASE_APPROVED", status_transacao: "APPROVED", email_comprador: "aluno@exemplo.com",
    });
  });

  it("aceita ausência de campos opcionais e rejeita payload sem identificador", () => {
    expect(normalizarEventoHotmart({ id: "evt-124" })).toMatchObject({ codigo_transacao: null, email_comprador: null });
    expect(() => normalizarEventoHotmart({ event: "PURCHASE_APPROVED" })).toThrow("sem identificador");
    expect(() => normalizarEventoHotmart([])).toThrow("Payload inválido");
  });

  it("registra um evento novo com payload bruto e normalizado", async () => {
    let registro: unknown;
    const supabase = { from: () => ({ insert: (value: unknown) => {
      registro = value;
      return { error: null };
    } }) };
    await expect(registrarEventoHotmart(supabase as never, payload)).resolves.toEqual({ duplicate: false });
    expect(registro).toMatchObject({ identificador_evento: "evt-123", payload_bruto: payload });
  });

  it("considera reenvio com o mesmo identificador como duplicado", async () => {
    const supabase = { from: () => ({ insert: () => ({ error: { code: "23505" } }) }) };
    await expect(registrarEventoHotmart(supabase as never, payload)).resolves.toEqual({ duplicate: true });
  });
});
