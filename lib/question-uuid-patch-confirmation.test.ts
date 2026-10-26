import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseQuestionPatch } from "./question-uuid-patch";
import { createQuestionPatchConfirmation, questionPatchSnapshotHash, verifyQuestionPatchConfirmation } from "./question-uuid-patch-confirmation";

const patch = parseQuestionPatch(readFileSync("lib/LC68PI_CORRECOES_UUID_V1_NAO_IMPORTAR_NO_ANKI.fixture.json", "utf8"));
const rows = patch.updates.map((item) => ({ id: item.uuid, lei_id: 1, ativo: true, ...item.expected_before, updated_at: "2026-01-01" }));
const context = { actorId: "admin", lawId: 1, patch, secret: "x".repeat(32), now: 1_000 };

describe("vínculo preparatório da confirmação UUID", () => {
  it("vincula usuário, lei, arquivo e snapshot e é estável para a ordem das linhas", () => {
    const token = createQuestionPatchConfirmation({ ...context, rows });
    const result = verifyQuestionPatchConfirmation(token, context);
    expect(result.snapshotHash).toBe(questionPatchSnapshotHash([...rows].reverse()));
    expect(questionPatchSnapshotHash([{ ...rows[0], assunto: "alterado" }, ...rows.slice(1)])).not.toBe(result.snapshotHash);
    expect(verifyQuestionPatchConfirmation(token, context).operationId).toBe(result.operationId);
  });
  it("rejeita alteração de usuário, lei, arquivo, assinatura e expiração", () => {
    const token = createQuestionPatchConfirmation({ ...context, rows });
    for (const changed of [{ ...context, actorId: "outro" }, { ...context, lawId: 2 }, { ...context, patch: { ...patch, law_slug: "outra" } }, { ...context, now: 901_000 }]) expect(() => verifyQuestionPatchConfirmation(token, changed)).toThrow();
    expect(() => verifyQuestionPatchConfirmation(`${token}x`, context)).toThrow();
  });
  it("vincula os bytes do arquivo e permite apenas consultar confirmação expirada", () => {
    const raw = JSON.stringify(patch);
    const token = createQuestionPatchConfirmation({ ...context, raw, rows });
    expect(() => verifyQuestionPatchConfirmation(token, { ...context, raw: `${raw} ` })).toThrow();
    expect(() => verifyQuestionPatchConfirmation(token, { ...context, raw, now: 901_000 })).toThrow();
    expect(verifyQuestionPatchConfirmation(token, { ...context, raw, now: 901_000, allowExpired: true }).operationId).toBeTruthy();
  });
});
