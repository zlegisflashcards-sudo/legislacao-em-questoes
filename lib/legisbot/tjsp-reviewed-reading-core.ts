import { createHash } from "node:crypto";
import { continuousReadingStructurePath, orderContinuousReadingStructures } from "./continuous-reading-structure-core";
import { sanitizeLegalHtmlCore } from "./sanitize-legal-html-core";
import type { ContinuousReadingModel } from "./continuous-reading-server";

type ReviewedBlock = readonly [id: string, order: string, structureId: number, hash: string];
type LiveBlock = { id: string; ordem: string; identificacao: string; structure_id: number | null; legislacao: string | null; preparado_em: string | null; situacao: string | null };
type LiveNode = { id: number; parent_id: number | null; ordem: number; tipo: string; nome: string };

export function buildReviewedReading(input: {
  law: ContinuousReadingModel["law"];
  manifest: readonly ReviewedBlock[];
  rows: readonly LiveBlock[];
  nodes: readonly LiveNode[];
  selected: ReadonlySet<number>;
  blocked: ReadonlySet<number>;
}): ContinuousReadingModel | null {
  const { law, manifest, rows, selected, blocked } = input;
  if (!manifest.length || rows.length !== manifest.length) return null;
  const byId = new Map(rows.map((row) => [row.id, row]));
  const nodes = input.nodes.map((node) => ({ ...node, parentId: node.parent_id }));
  const content = new Map<string, string>();
  const visible = new Set<number>();
  const references: ContinuousReadingModel["references"] = [];
  for (const [id, ordem, structureId, expectedHash] of manifest) {
    const row = byId.get(id);
    if (!row?.preparado_em || !row.legislacao || row.situacao === "arquivada" || row.situacao === "revogada"
      || row.ordem !== ordem || row.structure_id !== structureId || content.has(id)) return null;
    const path = continuousReadingStructurePath(structureId, nodes);
    if (!path.length || path[0].parentId !== null || !path.some((node) => selected.has(node.id))
      || path.some((node) => blocked.has(node.id))) return null;
    if (createHash("sha256").update(row.legislacao, "utf8").digest("hex") !== expectedHash) return null;
    const legislation = sanitizeLegalHtmlCore(row.legislacao).trim();
    if (!legislation) return null;
    content.set(id, legislation);
    for (const node of path) visible.add(node.id);
    references.push({
      id, slug: law.slug, ordem, identificacao: row.identificacao, prepared: true, sourceQuestionId: null,
      hierarchy: path.map((node) => ({ id: node.id, type: node.tipo, name: node.nome })),
      structureAssociation: "editorial", structureCandidateIds: [], recent: false, priority: "nao_mapeado",
      linkedQuestions: 0, inactive: false,
    });
  }
  const structures = orderContinuousReadingStructures(nodes).filter((node) => visible.has(node.id)).map((node) => ({
    id: node.id, parentId: node.parentId, type: node.tipo, name: node.nome, order: node.ordem, status: "accessible" as const,
  }));
  const accessibleStructureIds = structures.map((node) => node.id);
  return {
    law, references, structures, questions: [], studyUnits: [], studyUnitCoverageConflicts: [], reviewedBlockTexts: content,
    structureReadiness: { ready: true, unresolvedPreparedReferenceIds: [] },
    partialMode: { requested: true, active: true, reason: null },
    publicAccess: { mode: "partial", accessibleStructureIds, firstAccessibleStructureId: accessibleStructureIds[0] ?? null },
    integrity: { totalQuestions: 0, linkedQuestions: 0, pendingQuestions: 0, coveragePercent: 0, availableBlocks: references.length, readingAvailable: true, construction: false, completeness: null, resolutions: [] },
  };
}
