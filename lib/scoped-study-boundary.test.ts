import { describe, expect, it } from "vitest";
import { audioFullyContained, certifiedPlaybackTarget, fullyContainedStructureIds } from "./scoped-study-boundary";

describe("isolamento de conteúdo por recorte", () => {
  const structures = [{ id: 1, parent_id: null }, { id: 2, parent_id: 1 }, { id: 3, parent_id: 1 }, { id: 4, parent_id: 2 }];
  it("não libera ancestral contendo ramo de fora nem IDs ausentes", () => {
    expect(fullyContainedStructureIds(structures, new Set([1, 2, 4, 42]))).toEqual(new Set([2, 4]));
    expect(fullyContainedStructureIds([{ id: 2, parent_id: 2 }], new Set([2]))).toEqual(new Set());
  });
  it("nega áudio misto, global e sem cobertura editorial confirmada", () => {
    const fullyContainedIds = fullyContainedStructureIds(structures, new Set([2, 4]));
    expect(audioFullyContained({ primaryId: 2, explicitCoverageIds: [2, 4], fullyContainedIds })).toBe(true);
    expect(audioFullyContained({ primaryId: 2, explicitCoverageIds: [2, 3, 4], fullyContainedIds })).toBe(false);
    expect(audioFullyContained({ primaryId: 1, explicitCoverageIds: [2, 4], fullyContainedIds })).toBe(false);
    expect(audioFullyContained({ primaryId: 2, explicitCoverageIds: [], fullyContainedIds })).toBe(false);
    expect(audioFullyContained({ primaryId: null, explicitCoverageIds: [2, 4], fullyContainedIds })).toBe(false);
  });
});

describe("certificação por versão imutável do áudio (proposta não ligada à rota)", () => {
  const audio = { audioId: "a", lawId: 14, active: true, publishedAt: "2026-11-20", primaryId: 438 };
  const object = { bucket: "test-private", key: "same-path.mp4", version: "reviewed-version" };
  const certificate = { audioId: "a", lawId: 14, object, approvedAt: "2026-11-23", revokedAt: null, coveredStructureIds: [438, 166] };
  const baseline = { audio, certificate, pinnedPlaybackObject: object, fullyContainedIds: new Set([438, 166]) };

  it("só passa ao signatário a identidade imutável atestada", () => {
    expect(certifiedPlaybackTarget(baseline)).toEqual(object);
    expect(certifiedPlaybackTarget({ ...baseline, pinnedPlaybackObject: { ...object, version: "replacement" } })).toBeNull();
    expect(certifiedPlaybackTarget({ ...baseline, pinnedPlaybackObject: null })).toBeNull();
  });

  it("nega arquivo inativo/não publicado ou certificado de outra lei/faixa/revogado", () => {
    expect(certifiedPlaybackTarget({ ...baseline, audio: { ...audio, active: false } })).toBeNull();
    expect(certifiedPlaybackTarget({ ...baseline, audio: { ...audio, publishedAt: null } })).toBeNull();
    expect(certifiedPlaybackTarget({ ...baseline, certificate: { ...certificate, audioId: "b" } })).toBeNull();
    expect(certifiedPlaybackTarget({ ...baseline, certificate: { ...certificate, lawId: 15 } })).toBeNull();
    expect(certifiedPlaybackTarget({ ...baseline, certificate: { ...certificate, revokedAt: "2026-11-24" } })).toBeNull();
  });

  it("não libera conteúdo compartilhado com outro grupo mesmo na versão aprovada", () => {
    expect(certifiedPlaybackTarget({ ...baseline, certificate: { ...certificate, coveredStructureIds: [438, 166, 439] } })).toBeNull();
    expect(certifiedPlaybackTarget({ ...baseline, certificate: { ...certificate, coveredStructureIds: [438, 166] }, fullyContainedIds: new Set([438]) })).toBeNull();
  });
});
