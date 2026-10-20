import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync("lib/admin-legislative-preview.ts", "utf8");

describe("prévia administrativa de blocos legislativos", () => {
  it("calcula questões sem bloco pela resolução legislativa, não pela disponibilidade do LegisBot", () => {
    expect(source).toContain("resolveContinuousReadingIntegrity");
    expect(source).toContain("listManualQuestionReferenceTargets");
    expect(source).not.toContain("resolveQuestionLegisBotLinks");
    expect(source).not.toContain('status === "sem_legisbot"');
    expect(source).toContain('from("legislative_reference_inventory")');
    expect(source).toContain("findAdministrativeShadowArticles");
  });
});
