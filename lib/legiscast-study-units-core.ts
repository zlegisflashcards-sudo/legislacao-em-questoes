import type { LegiscastCoverageTrack } from "./legiscast-audio-coverage-core";
import { continuousReadingStructurePath, type ContinuousReadingStructureNode } from "./legisbot/continuous-reading-structure-core";

export type LegiscastStudyStructure = ContinuousReadingStructureNode & {
  name: string;
};

export type LegiscastStudyUnit = {
  /** Estável somente dentro da lei: nunca é um UUID de bloco ou de questão. */
  id: string;
  kind: "audio" | "text";
  audioId: string | null;
  /** Estrutura principal da faixa, ou a própria estrutura na unidade textual. */
  titleStructureId: number;
  /** Estruturas explicitamente pertencentes à unidade, sem inferência ancestral. */
  structureIds: number[];
};

export type LegiscastStudyCoverageConflict = {
  structureId: number;
  audioIds: string[];
};

export type LegiscastStudyUnits = {
  units: LegiscastStudyUnit[];
  conflicts: LegiscastStudyCoverageConflict[];
};

function structuralOrder(left: number, right: number, structures: readonly LegiscastStudyStructure[]) {
  const leftPath = continuousReadingStructurePath(left, structures);
  const rightPath = continuousReadingStructurePath(right, structures);
  const length = Math.min(leftPath.length, rightPath.length);
  for (let index = 0; index < length; index += 1) {
    const leftNode = leftPath[index];
    const rightNode = rightPath[index];
    if (leftNode.id === rightNode.id) continue;
    return leftNode.ordem - rightNode.ordem || leftNode.id - rightNode.id;
  }
  return leftPath.length - rightPath.length || left - right;
}

/**
 * Converte somente a cobertura editorial explícita em unidades de estudo.
 * A hierarquia serve para ordenar a experiência, jamais para aumentar a
 * cobertura de uma faixa. Um conflito retira a estrutura das unidades até a
 * decisão editorial, em vez de escolher uma das faixas por suposição.
 */
export function resolveLegiscastStudyUnits(input: {
  structures: readonly LegiscastStudyStructure[];
  tracks: readonly LegiscastCoverageTrack[];
  /** Marcações editoriais existentes: uma estrutura assim não recebe faixa. */
  notApplicableStructureIds?: readonly number[];
}): LegiscastStudyUnits {
  const structureIds = new Set(input.structures.map((structure) => structure.id));
  const notApplicableStructureIds = new Set(input.notApplicableStructureIds ?? []);
  const claims = new Map<number, string[]>();
  const coveredByTrack = new Map<string, number[]>();

  for (const track of input.tracks) {
    if (!track.active || track.structureId === null) continue;
    const covered = [...new Set([track.structureId, ...(track.coveredStructureIds ?? [])])]
      .filter((structureId) => structureIds.has(structureId) && !notApplicableStructureIds.has(structureId));
    if (!covered.length) continue;
    coveredByTrack.set(track.id, covered);
    for (const structureId of covered) claims.set(structureId, [...(claims.get(structureId) ?? []), track.id]);
  }

  const conflicts = [...claims.entries()]
    .filter(([, audioIds]) => new Set(audioIds).size > 1)
    .map(([structureId, audioIds]) => ({ structureId, audioIds: [...new Set(audioIds)].sort() }))
    .sort((left, right) => structuralOrder(left.structureId, right.structureId, input.structures));
  const conflictedStructureIds = new Set(conflicts.map((conflict) => conflict.structureId));
  const conflictedAudioIds = new Set(conflicts.flatMap((conflict) => conflict.audioIds));

  const audioUnits = input.tracks
    .filter((track) => track.active && track.structureId !== null && !conflictedAudioIds.has(track.id))
    .flatMap((track) => {
      const covered = (coveredByTrack.get(track.id) ?? []).filter((structureId) => !conflictedStructureIds.has(structureId));
      if (!covered.length || track.structureId === null) return [];
      return [{
        id: `audio:${track.id}`,
        kind: "audio" as const,
        audioId: track.id,
        titleStructureId: track.structureId,
        structureIds: covered.sort((left, right) => structuralOrder(left, right, input.structures)),
      }];
    });
  const assignedStructureIds = new Set(audioUnits.flatMap((unit) => unit.structureIds));
  const textUnits = input.structures
    // O conflito impede a escolha de uma faixa, não a leitura legislativa.
    // Mantemos uma unidade textual para que a pendência editorial não esconda
    // o dispositivo nem duplique conteúdo em duas unidades de áudio.
    .filter((structure) => !assignedStructureIds.has(structure.id))
    .map((structure) => ({
      id: `text:${structure.id}`,
      kind: "text" as const,
      audioId: null,
      titleStructureId: structure.id,
      structureIds: [structure.id],
    }));

  return {
    units: [...audioUnits, ...textUnits].sort((left, right) => structuralOrder(left.titleStructureId, right.titleStructureId, input.structures)),
    conflicts,
  };
}

/** A seleção pelo sumário abre a única unidade que cobre explicitamente o nó. */
export function resolveLegiscastStudyUnitForStructure(structureId: number | null, units: readonly LegiscastStudyUnit[]) {
  if (structureId === null) return null;
  const matches = units.filter((unit) => unit.structureIds.includes(structureId));
  return matches.length === 1 ? matches[0] : null;
}

export function legiscastStudyUnitStructureIds(unitId: string | null, units: readonly LegiscastStudyUnit[]) {
  return unitId === null ? [] : units.find((unit) => unit.id === unitId)?.structureIds ?? [];
}
