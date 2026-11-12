import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync("lib/admin-legislative-structure-integrity.ts", "utf8");
const publicReader = readFileSync("lib/legisbot/continuous-reading-server.ts", "utf8");

describe("diagnóstico estrutural administrativo", () => {
  it("reutiliza a resolução global e não cria resolução paralela de questões", () => {
    expect(source).toContain("resolveContinuousReadingIntegrity");
    expect(source).toContain("listManualQuestionReferenceTargets");
    expect(source).toContain("resolveContinuousReadingReferenceStructureAssociations");
  });

  it("mantém a leitura disponível quando a migration ainda não existir", () => {
    expect(source).toContain('withLink.error.code !== "PGRST204"');
    expect(source).toContain("structure_id: null");
    expect(publicReader).toContain('result.error?.code === "PGRST204"');
  });

  it("não altera liberação pública nem grava questões ou referências", () => {
    expect(source).not.toContain('.update(');
    expect(source).not.toContain('.insert(');
    expect(source).not.toContain('.delete(');
  });
});
