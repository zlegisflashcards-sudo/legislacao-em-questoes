import { describe, expect, it } from "vitest";
import { planLegislativeReferenceIdentifierRepair, prependLegalIdentifier } from "./legislative-reference-identifiers";

describe("reparo de identificadores da base legislativa", () => {
  it("inclui somente o Art. ausente dentro do primeiro parágrafo", () => {
    expect(prependLegalIdentifier("<p>Texto do caput.</p>", "Art. 2º.")).toBe("<p>Art. 2º. Texto do caput.</p>");
  });

  it("inclui somente o § ausente e mantém a marcação existente", () => {
    expect(prependLegalIdentifier("<p><strong>Texto</strong> do parágrafo.</p>", "§ 1º.")).toBe("<p>§ 1º. <strong>Texto</strong> do parágrafo.</p>");
  });

  it("não duplica identificadores e é idempotente", () => {
    const input = { id: "id", ordem: "0002.0.01.0.00.0", identification: "§ 1º.", legislation: "<p>§ 1º. Texto.</p>" };
    expect(planLegislativeReferenceIdentifierRepair(input)).toBeNull();
  });

  it("não tenta reparar identificações que não sejam Art. ou §", () => {
    expect(planLegislativeReferenceIdentifierRepair({ id: "id", ordem: "0002.0.01.0.01.0", identification: "I", legislation: "<p>Texto.</p>" })).toBeNull();
  });
});
