import "server-only";
import { createHash } from "node:crypto";

export const SCOPED_READING_VERSION = 1;

type OwnedText = {
  id: string; lawId: number; structureId: number | null; order: string; label: string;
  changedAt: string | null; rawHtml: string; shippedHtml: string;
};
type ReviewPin = { refId: string; lawId: number; structureId: number; sha256: string };

/** Versioned, unambiguous tuple of the same row snapshot that will be rendered.
 * Persist the pin only after editorial review of this exact representation. */
export function scopedReadingDigest(row: OwnedText) {
  return createHash("sha256").update(JSON.stringify([
    "scoped-reading/v1", row.id, row.lawId, row.structureId, row.order, row.label, row.changedAt, row.rawHtml, row.shippedHtml,
  ])).digest("hex");
}

export function matchesScopedReadingPin(row: OwnedText, pin: ReviewPin | undefined, allowed: ReadonlySet<number>) {
  return row.structureId !== null && allowed.has(row.structureId) && pin !== undefined &&
    pin.refId === row.id && pin.lawId === row.lawId && pin.structureId === row.structureId &&
    scopedReadingDigest(row) === pin.sha256;
}
