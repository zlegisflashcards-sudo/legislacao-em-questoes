import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { classifyQuestionPatch, parseQuestionPatch, QUESTION_PATCH_MAX_BYTES } from "./question-uuid-patch";
import { buildQuestionPatchPreview } from "./question-uuid-patch-preview";

const raw = readFileSync("lib/LC68PI_CORRECOES_UUID_V1_NAO_IMPORTAR_NO_ANKI.fixture.json", "utf8");
const copy = () => JSON.parse(raw);
describe("patch de questões por UUID", () => {
  it("valida o arquivo real e suas contagens", () => {
    const patch = parseQuestionPatch(raw);
    expect(patch.law_slug).toBe("lc68pi");
    expect(patch.source.exported_question_count).toBe(108);
    expect(patch.updates).toHaveLength(79);
    expect(patch.updates.filter((item) => item.changes.assunto)).toHaveLength(79);
    expect(patch.updates.filter((item) => item.changes.ordem)).toHaveLength(10);
  });
  it("identifica valores originais, finais e alterações parciais sem normalizá-los", () => {
    const item = parseQuestionPatch(raw).updates.find((row) => row.changes.ordem)!;
    expect(classifyQuestionPatch(item, item.expected_before)).toBe("apto");
    expect(classifyQuestionPatch(item, { ...item.expected_before, ...item.changes })).toBe("ja_aplicado");
    expect(classifyQuestionPatch(item, { ...item.expected_before, assunto: item.changes.assunto! })).toBe("conflito");
  });
  it("contabiliza a prévia real e bloqueia ausentes, inativas e pertencentes a outra lei", () => {
    const patch = parseQuestionPatch(raw);
    const rows = patch.updates.map((item) => ({ id: item.uuid, lei_id: 1, ativo: true, ...item.expected_before, updated_at: "2026-01-01" }));
    const valid = buildQuestionPatchPreview(patch, 1, rows);
    expect(valid.counts).toMatchObject({ questions: 79, aptos: 79, campos: 89, conflitos: 0 });
    rows[0].ativo = false; rows[1].lei_id = 2; rows.pop();
    expect(buildQuestionPatchPreview(patch, 1, rows).counts.conflitos).toBe(3);
    const doneRows = patch.updates.map((item) => ({ id: item.uuid, lei_id: 1, ativo: true, ...item.expected_before, ...item.changes, updated_at: "2026-01-01" }));
    expect(buildQuestionPatchPreview(patch, 1, doneRows).counts).toMatchObject({ ja_aplicados: 79, aptos: 0, campos: 0 });
  });
  it("rejeita UUID duplicado, valores vazios, campos extras e versão desconhecida", () => {
    const duplicate = copy(); duplicate.updates.push(duplicate.updates[0]);
    expect(() => parseQuestionPatch(JSON.stringify(duplicate))).toThrow(/repetido/);
    const empty = copy(); empty.updates[0].changes.assunto = null;
    expect(() => parseQuestionPatch(JSON.stringify(empty))).toThrow(/inválido/);
    const extra = copy(); extra.updates[0].changes.pergunta = "x";
    expect(() => parseQuestionPatch(JSON.stringify(extra))).toThrow(/não permitido/);
    const version = copy(); version.version = 2;
    expect(() => parseQuestionPatch(JSON.stringify(version))).toThrow(/versão/);
    expect(() => parseQuestionPatch("x".repeat(QUESTION_PATCH_MAX_BYTES + 1))).toThrow(/2 MiB/);
    expect(() => parseQuestionPatch("{" )).toThrow(/JSON inválido/);
  });
});
