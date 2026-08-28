import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const server = readFileSync("lib/law-campaign-server.ts", "utf8");

describe("erros ao registrar resposta da campanha", () => {
  it("mantém a orientação de recarregar somente para o conflito P0001", () => {
    expect(server).toContain('persistError.code === "P0001"');
    expect(server).toContain('"A questão atual foi atualizada. Recarregue a página para continuar."');
  });

  it("protege o aluno de detalhes técnicos e registra a falha no servidor", () => {
    expect(server).toContain('console.error("Falha ao registrar resposta da campanha"');
    expect(server).toContain('"Não foi possível registrar a resposta. Tente novamente."');
  });
});
