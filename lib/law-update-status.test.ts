import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("situação de atualização não verificada", () => {
  it("oferece o estado no formulário e o usa como padrão de criação", () => {
    const fields = readFileSync("components/admin/law-data-fields.tsx", "utf8");
    const server = readFileSync("lib/commercial-admin-server.ts", "utf8");

    expect(fields).toContain('<option value="nao_verificado">Não verificado</option>');
    expect(fields).toContain(': "nao_verificado"');
    expect(server).toContain('data.situacao_atualizacao ?? "nao_verificado"');
  });

  it("mantem a RPC de edicao alinhada ao dominio da coluna", () => {
    const migration = readFileSync("supabase/migrations/20261027130000_allow_unverified_law_update_rpc.sql", "utf8");

    expect(migration).toContain("security definer set search_path=''");
    expect(migration).toContain("('nao_verificado','atualizado','desatualizado')");
    expect(migration).toContain("public.admin_comercial_auditar");
    expect(migration).toContain("revoke all on function public.admin_atualizar_lei");
    expect(migration).toContain("grant execute on function public.admin_atualizar_lei(uuid,bigint,jsonb) to service_role");
  });
});
