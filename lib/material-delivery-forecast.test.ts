import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync("supabase/migrations/20260817110000_add_material_delivery_forecast.sql", "utf8");
const admin = readFileSync("components/admin/commercial-admin.tsx", "utf8");
const server = readFileSync("lib/commercial-admin-server.ts", "utf8");

describe("previsão de entrega de materiais", () => {
  it("mantém URL opcional e cria o campo de data sem modificar a referência existente", () => {
    expect(migration).toContain("add column if not exists data_entrega_prevista date");
    expect(migration).toContain("alter column url_externa drop not null");
    expect(migration).toContain("drop constraint if exists materiais_leis_url_nao_vazia");
    expect(migration).toContain("nullif(pg_catalog.btrim(p_url_externa),'')");
  });

  it("aceita a previsão no backend e permite preenchê-la no formulário administrativo", () => {
    expect(server).toContain('"data_entrega_prevista"');
    expect(server).toContain('optionalIsoDate(data.data_entrega_prevista, "Data de entrega prevista")');
    expect(admin).toContain('name="data_entrega_prevista"');
    expect(admin).toContain('placeholder="URL externa (opcional)"');
  });
});
