import { createHash } from "node:crypto";
import type { ContinuousReadingStructureIntegrity } from "./continuous-reading-structure-integrity-core";

/** Assinatura estável da evidência que o administrador revisou antes de liberar. */
export function continuousReadingIntegrityFingerprint(report: ContinuousReadingStructureIntegrity) {
  const value = JSON.stringify({
    structureId: report.structureId,
    descendants: [...report.descendantStructureIds].sort((a, b) => a - b),
    questions: report.activeQuestionCount,
    prepared: report.preparedReferenceCount,
    orphan: report.orphanQuestionCount,
    pending: report.pendingAssociationCount,
    articleContinuity: report.articleContinuity ?? null,
    status: report.status,
    reasons: [...report.reasons].sort(),
  });
  return createHash("sha256").update(value).digest("hex");
}
