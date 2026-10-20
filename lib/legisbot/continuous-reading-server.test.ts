import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const server = readFileSync("lib/legisbot/continuous-reading-server.ts", "utf8");

describe("carregamento da leitura contínua", () => {
  it("reutiliza o snapshot de questões do modelo ao resolver endereços legados", () => {
    const resolver = server.slice(server.indexOf("export async function resolveContinuousReference"));
    expect(resolver).toContain("questions: model.questions");
    expect(resolver).not.toContain("await allQuestions(model.law.id)");
  });

  it("mantém a paginação dependente de uma verificação de integridade do servidor", () => {
    const route = readFileSync("app/api/legisbot/[slug]/references/route.ts", "utf8");
    expect(route).toContain("getContinuousReadingModel(slug)");
    expect(route).toContain("model.integrity.readingAvailable");
    expect(route).toContain("getContinuousReadingBlocks(model, offset, limit)");
  });
});
