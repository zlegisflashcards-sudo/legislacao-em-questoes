import { sortLegiscastAudios, type LegiscastAudioOrderable } from "@/lib/legiscast-audio-order";

export type LegiscastStructureNode = { id: number; parent_id: number | null; tipo: string; nome: string; ordem: number | null };
export type LegiscastStructuredAudio = LegiscastAudioOrderable & { structure_id: number | null };
export type LegiscastPlaylistAudio<T extends LegiscastStructuredAudio> = T & { titleGroup: string | null; titleGroupId: number | null };

const collator = new Intl.Collator("pt-BR", { numeric: true, sensitivity: "base" });

function titleForStructure(structureId: number | null, byId: Map<number, LegiscastStructureNode>) {
  const visited = new Set<number>();
  for (let currentId = structureId; currentId !== null && !visited.has(currentId); currentId = byId.get(currentId)?.parent_id ?? null) {
    visited.add(currentId);
    const current = byId.get(currentId);
    if (current?.tipo === "titulo") return current;
  }
  return null;
}

function compareTitleGroups(left: LegiscastStructureNode, right: LegiscastStructureNode) {
  const order = Number(left.ordem ?? 0) - Number(right.ordem ?? 0);
  if (order) return order;
  const name = collator.compare(left.nome, right.nome);
  return name || left.id - right.id;
}

/** Agrupa áudios pelo ancestral estrutural real de tipo `titulo`, sem inferir nomes. */
export function sortLegiscastAudiosByStructure<T extends LegiscastStructuredAudio>(audios: T[], structure: LegiscastStructureNode[]): LegiscastPlaylistAudio<T>[] {
  const byId = new Map(structure.map((node) => [node.id, node]));
  const titledGroups = new Map<number, { title: LegiscastStructureNode; audios: T[] }>();
  const ungrouped: T[] = [];

  for (const audio of audios) {
    const title = titleForStructure(audio.structure_id, byId);
    if (!title) { ungrouped.push(audio); continue; }
    const group = titledGroups.get(title.id) ?? { title, audios: [] };
    group.audios.push(audio);
    titledGroups.set(title.id, group);
  }

  const grouped = [...titledGroups.values()]
    .sort((left, right) => compareTitleGroups(left.title, right.title))
    .flatMap(({ title, audios: groupAudios }) => sortLegiscastAudios(groupAudios).map((audio) => ({ ...audio, titleGroup: title.nome, titleGroupId: title.id })));
  return [...grouped, ...sortLegiscastAudios(ungrouped).map((audio) => ({ ...audio, titleGroup: null, titleGroupId: null }))];
}
