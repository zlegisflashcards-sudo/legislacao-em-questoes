import { createHash, createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import type { QuestionPatch } from "./question-uuid-patch";
import type { PatchQuestion } from "./question-uuid-patch-preview";

// Contrato preparatório: não aplica alterações nem escolhe o segredo do servidor.
// A aplicação transacional deve revalidar o snapshot sob bloqueio no banco.
type Confirmation = { version: 1; operationId: string; actorId: string; lawId: number; patchHash: string; snapshotHash: string; expiresAt: number };

export function questionPatchHash(patch: QuestionPatch, raw?: string) {
  return createHash("sha256").update(raw ?? JSON.stringify(patch)).digest("hex");
}

export function questionPatchSnapshotHash(rows: PatchQuestion[]) {
  const snapshot = [...rows].sort((a, b) => a.id.localeCompare(b.id)).map((row) => [row.id, row.lei_id, row.ativo, row.assunto, row.ordem, row.updated_at]);
  return createHash("sha256").update(JSON.stringify(snapshot)).digest("hex");
}

export function createQuestionPatchConfirmation(input: { actorId: string; lawId: number; patch: QuestionPatch; raw?: string; rows: PatchQuestion[]; secret: string; now: number }) {
  if (!input.actorId || !Number.isSafeInteger(input.lawId) || input.lawId < 1 || input.secret.length < 32) throw new Error("Contexto de confirmação inválido.");
  const payload: Confirmation = { version: 1, operationId: randomUUID(), actorId: input.actorId, lawId: input.lawId, patchHash: questionPatchHash(input.patch, input.raw), snapshotHash: questionPatchSnapshotHash(input.rows), expiresAt: input.now + 15 * 60_000 };
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = createHmac("sha256", input.secret).update(encoded).digest("base64url");
  return `${encoded}.${signature}`;
}

export function verifyQuestionPatchConfirmation(token: string, input: { actorId: string; lawId: number; patch: QuestionPatch; raw?: string; secret: string; now: number; allowExpired?: boolean }): Confirmation {
  if (input.secret.length < 32 || token.length > 4096) throw new Error("Confirmação inválida.");
  const parts = token.split(".");
  if (parts.length !== 2) throw new Error("Confirmação inválida.");
  const expected = createHmac("sha256", input.secret).update(parts[0]).digest();
  const provided = Buffer.from(parts[1], "base64url");
  if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) throw new Error("Confirmação inválida.");
  let value: Confirmation;
  try { value = JSON.parse(Buffer.from(parts[0], "base64url").toString("utf8")) as Confirmation; } catch { throw new Error("Confirmação inválida."); }
  if (value.version !== 1 || value.actorId !== input.actorId || value.lawId !== input.lawId || value.patchHash !== questionPatchHash(input.patch, input.raw) || !Number.isSafeInteger(value.expiresAt) || (!input.allowExpired && value.expiresAt <= input.now) || !/^[0-9a-f-]{36}$/.test(value.operationId) || !/^[0-9a-f]{64}$/.test(value.snapshotHash)) throw new Error("Confirmação expirada ou incompatível com a prévia.");
  return value;
}
