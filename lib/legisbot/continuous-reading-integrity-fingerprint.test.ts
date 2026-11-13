import { describe, expect, it } from "vitest";
import { continuousReadingIntegrityFingerprint } from "./continuous-reading-integrity-fingerprint";

const base = { structureId: 1, name: "Capítulo", path: ["Capítulo"], descendantStructureIds: [1, 2], activeQuestionCount: 4, preparedReferenceCount: 3, orphanQuestionCount: 0, pendingAssociationCount: 0, status: "ready" as const, reasons: [] };

describe("fingerprint de integridade da estrutura", () => {
  it("é estável para a mesma evidência e muda diante de alteração relevante", () => {
    expect(continuousReadingIntegrityFingerprint(base)).toBe(continuousReadingIntegrityFingerprint({ ...base, descendantStructureIds: [2, 1] }));
    expect(continuousReadingIntegrityFingerprint(base)).not.toBe(continuousReadingIntegrityFingerprint({ ...base, orphanQuestionCount: 1, status: "orphan_questions", reasons: ["orphan_question"] }));
  });
});
