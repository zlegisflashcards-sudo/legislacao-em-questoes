import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const server = readFileSync("lib/legisbot/continuous-reading-server.ts", "utf8");

describe("carregamento da leitura contínua", () => {
  it("reutiliza o snapshot de questões do modelo ao resolver endereços legados", () => {
    const resolver = server.slice(server.indexOf("export async function resolveContinuousReference"));
    expect(resolver).toContain("questions: model.questions");
    expect(resolver).not.toContain("await allQuestions(model.law.id)");
  });

  it("usa o índice canônico da página e encaminha o escopo editorial para validação no servidor", () => {
    const route = readFileSync("app/api/legisbot/[slug]/references/route.ts", "utf8");
    expect(route).toContain("study_unit_id");
    expect(route).toContain("getContinuousReadingBlockTextsForLaw(slug, referenceIds, structureId, studyUnitId)");
    expect(route).toContain("reference_ids");
    expect(route).toContain("getContinuousReadingStructureReadiness(slug)");
    expect(route).not.toContain("getContinuousReadingModel(slug)");
    expect(route).not.toContain("getContinuousReadingBlocks(model");
  });

  it("revalida no servidor os blocos no modo parcial e em unidades de estudo", () => {
    expect(server).toContain("if (rawStudyUnitId !== null || await partialReadingRequested(slug))");
    expect(server).toContain("continuousReadingReferencesForStructure(model, structureId)");
    expect(server).toContain("continuousReadingReferencesForStudyUnit(model, rawStudyUnitId)");
    expect(server).toContain(".eq(\"lei_id\", lawId)");
  });

  it("não ativa a leitura parcial pela mera existência das migrations", () => {
    expect(server).toContain('PARTIAL_READING_KEY_PREFIX = "lei_interativa_modo_parcial:"');
    expect(server).toContain('=== "habilitado"');
    expect(server).toContain("migrationsAvailable: false");
  });

  it("calcula a trava estrutural antes de qualquer recorte parcial ou paginação", () => {
    expect(server).toContain("const structureReadiness = resolveContinuousReadingStructureReadiness");
    expect(server).toContain("references: referenceInput");
    const readiness = server.indexOf("const structureReadiness = resolveContinuousReadingStructureReadiness");
    expect(readiness).toBeLessThan(server.indexOf("const publicReferences ="));
    const referencesRoute = readFileSync("app/api/legisbot/[slug]/references/route.ts", "utf8");
    expect(referencesRoute).toContain("!structureReadiness.ready");
  });

  it("não entrega ao sumário estruturas de títulos fechados no modo parcial", () => {
    expect(server).toContain("const visibleStructureIds");
    expect(server).toContain("publicAccess.accessibleStructureIds");
    expect(server).toContain(".filter((structure) => visibleStructureIds.has(structure.id))");
    expect(server).not.toContain("releaseByStructure.get(structure.id) === \"blocked\"");
  });
});
