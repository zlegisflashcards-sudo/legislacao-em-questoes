import { describe, expect, it } from "vitest";
import { detectManualLegislativeReference, isCanonicalManualReferenceOrder } from "./manual-legislative-reference";

describe("detecção de bloco legislativo manual", () => {
  it("sugere a Ordem canônica para artigo com letra e parágrafo", () => {
    expect(detectManualLegislativeReference("Art. 18-A, § 1º. Texto do dispositivo.", "Lei nº 1.593/2026")).toEqual({
      suggestion: { identification: "Art. 18-A, § 1º, Lei nº 1.593/2026", ordem: "0018.a.01.0.00.0" },
      warning: null,
    });
  });

  it("não escolhe uma Ordem quando há mais de um dispositivo", () => {
    const detected = detectManualLegislativeReference("Art. 18. Texto. Art. 19. Outro texto.", "Lei nº 1.593/2026");
    expect(detected.suggestion).toBeNull();
    expect(detected.warning).toContain("mais de um dispositivo");
  });

  it("aceita somente a Ordem com seis segmentos canônicos", () => {
    expect(isCanonicalManualReferenceOrder("0018.a.01.0.00.0")).toBe(true);
    expect(isCanonicalManualReferenceOrder("18-A, § 1º")).toBe(false);
  });
});
