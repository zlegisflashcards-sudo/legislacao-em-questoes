import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const server = readFileSync("lib/legisbot/continuous-reading-server.ts", "utf8");

describe("carregamento da leitura contínua", () => {
  it("reutiliza o snapshot de questões do modelo ao resolver endereços legados", () => {
    const resolver = server.slice(server.indexOf("export async function resolveContinuousReference"));
    expect(resolver).toContain("questions: model.questions");
    expect(resolver).not.toContain("await allQuestions(model.law.id)");
  });

  it("usa o índice canônico da página e não remonta o modelo ao buscar textos", () => {
    const route = readFileSync("app/api/legisbot/[slug]/references/route.ts", "utf8");
    expect(route).toContain("getContinuousReadingBlockTextsForLaw(slug, referenceIds, structureId)");
    expect(route).toContain("reference_ids");
    expect(route).not.toContain("getContinuousReadingModel(slug)");
    expect(route).not.toContain("getContinuousReadingBlocks(model");
  });

  it("revalida no servidor os blocos quando o modo parcial foi solicitado", () => {
    expect(server).toContain("if (await partialReadingRequested(slug))");
    expect(server).toContain("continuousReadingReferencesForStructure(model, structureId)");
    expect(server).toContain(".eq(\"lei_id\", lawId)");
  });

  it("não ativa a leitura parcial pela mera existência das migrations", () => {
    expect(server).toContain('PARTIAL_READING_KEY_PREFIX = "lei_interativa_modo_parcial:"');
    expect(server).toContain('=== "habilitado"');
    expect(server).toContain("migrationsAvailable: false");
  });
});
