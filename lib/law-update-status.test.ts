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
});
