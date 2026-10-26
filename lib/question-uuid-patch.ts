/** Contrato v1: até 2 MiB, 5.000 questões, assunto de 500 e ordem de 100 caracteres. */
export const QUESTION_PATCH_MAX_BYTES = 2 * 1024 * 1024;
const MAX_UPDATES = 5000;
type Fields = { assunto: string; ordem: string };
export type QuestionPatchItem = { uuid: string; expected_before: Fields; changes: Partial<Fields> };
export type QuestionPatch = { format: "legisflashcards.question-patch"; version: 1; law_slug: string; source: { kind: "exported_apkg"; sha256: string; exported_question_count: number }; updates: QuestionPatchItem[] };

function record(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label} deve ser um objeto.`);
  return value as Record<string, unknown>;
}
function keys(value: Record<string, unknown>, allowed: string[], label: string) {
  if (Object.keys(value).some((key) => !allowed.includes(key))) throw new Error(`${label} contém campo não permitido.`);
}
function field(value: unknown, name: keyof Fields): string {
  if (typeof value !== "string" || !value.trim() || value.length > (name === "assunto" ? 500 : 100)) throw new Error(`${name} está vazio, inválido ou excede o limite.`);
  if (name === "ordem" && !/^[A-Za-z0-9]+(?:\.[A-Za-z0-9]+)*$/.test(value)) throw new Error("Ordem inválida.");
  return value;
}

export function parseQuestionPatch(raw: string): QuestionPatch {
  if (new TextEncoder().encode(raw).byteLength > QUESTION_PATCH_MAX_BYTES) throw new Error("O arquivo excede 2 MiB.");
  let parsed: unknown;
  try { parsed = JSON.parse(raw); } catch { throw new Error("JSON inválido."); }
  const root = record(parsed, "Arquivo"); keys(root, ["format", "version", "law_slug", "source", "updates"], "Arquivo");
  if (root.format !== "legisflashcards.question-patch" || root.version !== 1) throw new Error("Formato ou versão de patch não suportado.");
  if (typeof root.law_slug !== "string" || !/^[a-z0-9][a-z0-9_-]{0,99}$/.test(root.law_slug)) throw new Error("Slug da lei inválido.");
  const source = record(root.source, "Proveniência"); keys(source, ["kind", "sha256", "exported_question_count"], "Proveniência");
  if (source.kind !== "exported_apkg" || typeof source.sha256 !== "string" || !/^[0-9a-f]{64}$/.test(source.sha256) || !Number.isSafeInteger(source.exported_question_count) || Number(source.exported_question_count) < 1) throw new Error("Proveniência inválida.");
  if (!Array.isArray(root.updates) || !root.updates.length || root.updates.length > MAX_UPDATES) throw new Error("O patch deve conter de 1 a 5.000 questões.");
  const ids = new Set<string>();
  const updates = root.updates.map((value, index): QuestionPatchItem => {
    const item = record(value, `Questão ${index + 1}`); keys(item, ["uuid", "expected_before", "changes"], `Questão ${index + 1}`);
    if (typeof item.uuid !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(item.uuid)) throw new Error(`UUID inválido na questão ${index + 1}.`);
    if (ids.has(item.uuid)) throw new Error(`UUID repetido: ${item.uuid}.`); ids.add(item.uuid);
    const before = record(item.expected_before, "Valores esperados"); keys(before, ["assunto", "ordem"], "Valores esperados");
    const changes = record(item.changes, "Alterações"); keys(changes, ["assunto", "ordem"], "Alterações");
    if (!Object.keys(changes).length) throw new Error("A questão não contém alterações.");
    return { uuid: item.uuid, expected_before: { assunto: field(before.assunto, "assunto"), ordem: field(before.ordem, "ordem") }, changes: { ...(Object.hasOwn(changes, "assunto") ? { assunto: field(changes.assunto, "assunto") } : {}), ...(Object.hasOwn(changes, "ordem") ? { ordem: field(changes.ordem, "ordem") } : {}) } };
  });
  return { format: "legisflashcards.question-patch", version: 1, law_slug: root.law_slug, source: { kind: "exported_apkg", sha256: source.sha256, exported_question_count: Number(source.exported_question_count) }, updates };
}

export function classifyQuestionPatch(item: QuestionPatchItem, current: Fields): "apto" | "ja_aplicado" | "conflito" {
  const final = { ...item.expected_before, ...item.changes };
  if (current.assunto === final.assunto && current.ordem === final.ordem) return "ja_aplicado";
  if (current.assunto === item.expected_before.assunto && current.ordem === item.expected_before.ordem) return "apto";
  return "conflito";
}
