import { describe, expect, it } from "vitest";
import { assertLegislativeReferenceStructureLaw, LegislativeReferenceStructureLinkError } from "./legislative-reference-structure-link-core";

describe("vínculo editorial referência × estrutura", () => {
  it("aceita estrutura da mesma lei e permite remoção manual", () => {
    expect(() => assertLegislativeReferenceStructureLaw({ referenceLawId: 10, structureLawId: 10 })).not.toThrow();
    expect(() => assertLegislativeReferenceStructureLaw({ referenceLawId: 10, structureLawId: null })).not.toThrow();
  });

  it("rejeita associação entre leis diferentes", () => {
    expect(() => assertLegislativeReferenceStructureLaw({ referenceLawId: 10, structureLawId: 11 }))
      .toThrow(LegislativeReferenceStructureLinkError);
  });
});
