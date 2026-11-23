import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { matchesScopedReadingPin, scopedReadingDigest } from "./scoped-study-reading-pin";
describe("atestado da versão exata do bloco para leitura recortada (proposta)", () => {
  const row = { id: "r", lawId: 14, structureId: 438, order: "0001.0.00.0.00.0", label: "Art.1", changedAt: null, rawHtml: "<p>Autorizado</p>", shippedHtml: "<p>Autorizado</p>" };
  const pin = { refId: row.id, lawId: row.lawId, structureId: row.structureId, sha256: scopedReadingDigest(row) };
  const allowed = new Set([438, 166]);
  it("nega HTML editado mesmo sem atualização do timestamp; não usa só id/lei", () => {
    expect(matchesScopedReadingPin(row, pin, allowed)).toBe(true);
    expect(matchesScopedReadingPin({ ...row, rawHtml: "<p>Autorizado</p><p>Art. 6º.</p>" }, pin, allowed)).toBe(false);
    expect(matchesScopedReadingPin({ ...row, shippedHtml: "<p>Outro</p>" }, pin, allowed)).toBe(false);
    expect(matchesScopedReadingPin({ ...row, changedAt: "2026-11-23" }, pin, allowed)).toBe(false);
    expect(matchesScopedReadingPin({ ...row, label: "Art. 6º" }, pin, allowed)).toBe(false);
    expect(matchesScopedReadingPin({ ...row, order: "0006.0.00.0.00.0" }, pin, allowed)).toBe(false);
  });
  it("nega pin ausente/fora da estrutura e reutilização em outro bloco", () => {
    expect(matchesScopedReadingPin(row, undefined, allowed)).toBe(false);
    expect(matchesScopedReadingPin(row, pin, new Set([166]))).toBe(false);
    expect(matchesScopedReadingPin({ ...row, id: "another" }, pin, allowed)).toBe(false);
    expect(matchesScopedReadingPin({ ...row, lawId: 15 }, pin, allowed)).toBe(false);
  });
});
