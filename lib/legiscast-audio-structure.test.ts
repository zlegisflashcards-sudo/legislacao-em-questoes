import { describe, expect, it } from "vitest";
import { sortLegiscastAudiosByStructure, type LegiscastStructuredAudio, type LegiscastStructureNode } from "./legiscast-audio-structure";

const node = (id: number, tipo: string, nome: string, parent_id: number | null, ordem = 0): LegiscastStructureNode => ({ id, tipo, nome, parent_id, ordem });
const audio = (id: string, titulo: string, structure_id: number | null, ordem = 0): LegiscastStructuredAudio => ({ id, titulo, structure_id, ordem, created_at: "2026-01-01T00:00:00.000Z" });

describe("hierarquia estrutural da playlist do LegisCast", () => {
  it("agrupa capítulos pela ancestral real de tipo título e preserva numeração reiniciada", () => {
    const structure = [node(10, "titulo", "TÍTULO II — Organização", null, 2), node(11, "capitulo", "Capítulo 1 — Z", 10), node(12, "capitulo", "Capítulo 2 — W", 10), node(1, "titulo", "TÍTULO I — Disposições gerais", null, 1), node(2, "capitulo", "Capítulo 2 — Y", 1), node(3, "capitulo", "Capítulo 1 — X", 1)];
    const result = sortLegiscastAudiosByStructure([audio("z", "Capítulo 1 — Z", 11), audio("y", "Capítulo 2 — Y", 2), audio("x", "Capítulo 1 — X", 3), audio("w", "Capítulo 2 — W", 12)], structure);
    expect(result.map((item) => `${item.titleGroup}|${item.titulo}`)).toEqual(["TÍTULO I — Disposições gerais|Capítulo 1 — X", "TÍTULO I — Disposições gerais|Capítulo 2 — Y", "TÍTULO II — Organização|Capítulo 1 — Z", "TÍTULO II — Organização|Capítulo 2 — W"]);
  });

  it("encontra o título por ancestrais mesmo para estrutura abaixo de capítulo", () => {
    const structure = [node(1, "titulo", "Título I", null), node(2, "capitulo", "Capítulo 1", 1), node(3, "secao", "Seção 1", 2), node(4, "subsecao", "Subseção 1", 3)];
    expect(sortLegiscastAudiosByStructure([audio("a", "Áudio", 4)], structure)[0]).toMatchObject({ titleGroup: "Título I", titleGroupId: 1 });
  });

  it("mantém áudios sem título pai em playlist normal, sem cabeçalho fictício", () => {
    const structure = [node(2, "capitulo", "Capítulo 2", null), node(1, "capitulo", "Capítulo 1", null)];
    const result = sortLegiscastAudiosByStructure([audio("two", "Capítulo 2", 2), audio("one", "Capítulo 1", 1), audio("none", "Introdução", null)], structure);
    expect(result.map((item) => [item.titleGroup, item.titulo])).toEqual([[null, "Capítulo 1"], [null, "Capítulo 2"], [null, "Introdução"]]);
  });

  it("preserva áudio associado diretamente ao título como faixa reproduzível do grupo", () => {
    const structure = [node(1, "titulo", "Título I", null), node(2, "capitulo", "Capítulo 1", 1)];
    const result = sortLegiscastAudiosByStructure([audio("title", "Abertura", 1), audio("chapter", "Capítulo 1", 2)], structure);
    expect(result.map((item) => [item.titleGroup, item.titulo])).toEqual([["Título I", "Abertura"], ["Título I", "Capítulo 1"]]);
  });

  it("mantém ordem manual e natural dentro de cada título", () => {
    const structure = [node(1, "titulo", "Título I", null), node(2, "capitulo", "Capítulo 10", 1), node(3, "capitulo", "Capítulo 2", 1)];
    const result = sortLegiscastAudiosByStructure([audio("ten", "Capítulo 10", 2), audio("intro", "Introdução", 2, 1), audio("two", "Capítulo 2", 3)], structure);
    expect(result.map((item) => item.titulo)).toEqual(["Introdução", "Capítulo 2", "Capítulo 10"]);
  });
});
