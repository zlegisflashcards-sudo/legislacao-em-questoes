import { createHmac, timingSafeEqual } from "node:crypto";

const PREVIEW_LIFETIME_MS = 10 * 60 * 1000;

export type BulkDeletionPreviewBinding = {
  actorId: string;
  target: object;
  ids: readonly string[];
  impact: { campaigns: readonly string[]; questions: number; answers: number; progress: number };
};

function sign(secret: string, binding: BulkDeletionPreviewBinding, expiresAt: number) {
  const { actorId, target, ids, impact } = binding;
  const snapshot = JSON.stringify([
    "admin-bulk-question-deletion-v1", expiresAt, actorId, target,
    [...ids].sort(), [...impact.campaigns].sort(), impact.questions, impact.answers, impact.progress,
  ]);
  return createHmac("sha256", secret).update(snapshot).digest("hex");
}

export function createBulkDeletionPreviewToken(secret: string, binding: BulkDeletionPreviewBinding, now = Date.now()) {
  const expiresAt = now + PREVIEW_LIFETIME_MS;
  return `${expiresAt}.${sign(secret, binding, expiresAt)}`;
}

export function matchesBulkDeletionPreviewToken(secret: string, token: unknown, binding: BulkDeletionPreviewBinding, now = Date.now()) {
  if (typeof token !== "string" || !/^\d{13}\.[0-9a-f]{64}$/.test(token)) return false;
  const [timestamp, signature] = token.split(".");
  const expiresAt = Number(timestamp);
  if (expiresAt <= now || expiresAt > now + PREVIEW_LIFETIME_MS) return false;
  return timingSafeEqual(Buffer.from(signature, "hex"), Buffer.from(sign(secret, binding, expiresAt), "hex"));
}
