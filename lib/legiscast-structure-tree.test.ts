import { describe, expect, it } from "vitest";
import { buildLegiscastStructureTree } from "./legiscast-structure-tree";

const node = (id: number, nome: string, parent_id: number | null, ordem = 0, tipo = "capitulo") => ({ id, nome, parent_id, ordem, tipo });

describe("sumário estrutural do LegisCast", () => {
  it("mantém a árvore completa e ordenada por ordem estrutural", () => {
    const tree = buildLegiscastStructureTree([node(4, "Seção II", 2, 2, "secao"), node(1, "Título II", null, 2, "titulo"), node(3, "Seção I", 2, 1, "secao"), node(2, "Capítulo I", 1, 1)]);
    expect(tree.map((item) => item.nome)).toEqual(["Título II"]);
    expect(tree[0].children[0].children.map((item) => item.nome)).toEqual(["Seção I", "Seção II"]);
  });

  it("mantém capítulos raiz quando a lei não possui títulos", () => {
    expect(buildLegiscastStructureTree([node(2, "Capítulo 2", null), node(1, "Capítulo 1", null)]).map((item) => item.nome)).toEqual(["Capítulo 1", "Capítulo 2"]);
  });
});
