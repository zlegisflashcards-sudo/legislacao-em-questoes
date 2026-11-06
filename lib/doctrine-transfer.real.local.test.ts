import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  doctrineRowsFromTransfer,
  previewDoctrineImport,
  type DoctrineTransferPayload,
} from "./doctrine-import-contract";
import { DRAFT_DOCTRINE_SLUG, planDoctrineRegistration } from "./doctrine-registration-plan";
import { buildDoctrinePersistencePlan } from "./doctrine-persistence-plan";

const artifactPath = process.env.DADM_TRANSFER_JSON;

describe.skipIf(!artifactPath)("artefato DADM local", () => {
  it("preserva as 282 notas, 105 tópicos, 11 estruturas e identidades", () => {
    const payload = JSON.parse(readFileSync(artifactPath!, "utf8")) as DoctrineTransferPayload;
    const preview = previewDoctrineImport(doctrineRowsFromTransfer(payload));

    expect(preview.issues).toEqual([]);
    expect(preview.rows).toHaveLength(282);
    expect(preview.topicCount).toBe(105);
    expect(preview.structureCount).toBe(11);
    expect(preview.orders).toHaveLength(105);
    expect(preview.orders).toEqual(expect.arrayContaining(["001", "105"]));

    const registration = planDoctrineRegistration(payload);
    expect(registration).toMatchObject({
      slug: DRAFT_DOCTRINE_SLUG,
      titulo: "Direito Administrativo",
      tipoConteudo: "doutrina",
      questions: 282,
      topics: 105,
      errors: [],
    });
    expect(registration.structures).toHaveLength(11);

    const persistence = buildDoctrinePersistencePlan(payload);
    expect(persistence.questions).toHaveLength(282);
    expect(persistence.structures).toHaveLength(11);
    expect(new Set(persistence.questions.map((question) => question.id)).size).toBe(282);
    expect(persistence.questions.every((question) => question.legislacao === null && question.artigo === null)).toBe(true);
  });
});
