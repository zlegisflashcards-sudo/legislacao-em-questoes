import { describe, expect, it } from "vitest";
import { descendantStructureIds, structurePath, validateStructureReparenting } from "./law-structure-reparent";

const nodes = [
  { id: 1, lei_id: 10, parent_id: null, nome: "Título", ordem: 1, updated_at: "a" },
  { id: 2, lei_id: 10, parent_id: 1, nome: "Seção", ordem: 1, updated_at: "b" },
  { id: 3, lei_id: 10, parent_id: 2, nome: "Subseção", ordem: 2, updated_at: "c" },
  { id: 4, lei_id: 10, parent_id: 1, nome: "Outra seção", ordem: 3, updated_at: "d" },
  { id: 5, lei_id: 11, parent_id: null, nome: "Outra lei", ordem: 1, updated_at: "e" },
];

describe("reparenting da estrutura", () => {
  it("preserva o nó e seus vínculos ao calcular a mudança", () => {
    const before = structuredClone(nodes);
    const result = validateStructureReparenting(nodes, 3, 4);
    expect(result.node).toMatchObject({ id: 3, lei_id: 10, ordem: 2, nome: "Subseção" });
    expect(nodes).toEqual(before);
    expect(structurePath(3, nodes)).toEqual(["Título", "Seção", "Subseção"]);
  });

  it("bloqueia auto-vínculo, descendência e destino de outra lei", () => {
    expect(() => validateStructureReparenting(nodes, 2, 2)).toThrow("pai de si mesma");
    expect(descendantStructureIds(2, nodes)).toEqual(new Set([3]));
    expect(() => validateStructureReparenting(nodes, 2, 3)).toThrow("descendência");
    expect(() => validateStructureReparenting(nodes, 3, 5)).toThrow("mesma lei");
  });

  it("não renumera silenciosamente quando a posição conflita", () => {
    const withConflict = [...nodes, { id: 6, lei_id: 10, parent_id: 1, nome: "Conflito", ordem: 2, updated_at: "f" }];
    expect(() => validateStructureReparenting(withConflict, 3, 1)).toThrow("posição 2");
  });
});
