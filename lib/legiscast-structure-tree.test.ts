import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildLegiscastStructureTree } from "./legiscast-structure-tree";

const node = (id: number, nome: string, parent_id: number | null, ordem = 0, tipo = "capitulo") => ({ id, nome, parent_id, ordem, tipo });
const player = readFileSync("components/legiscast-audio-player.tsx", "utf8");

describe("sumário estrutural do LegisCast", () => {
  it("mantém a árvore completa e ordenada por ordem estrutural", () => {
    const tree = buildLegiscastStructureTree([node(4, "Seção II", 2, 2, "secao"), node(1, "Título II", null, 2, "titulo"), node(3, "Seção I", 2, 1, "secao"), node(2, "Capítulo I", 1, 1)]);
    expect(tree.map((item) => item.nome)).toEqual(["Título II"]);
    expect(tree[0].children[0].children.map((item) => item.nome)).toEqual(["Seção I", "Seção II"]);
  });

  it("mantém capítulos raiz quando a lei não possui títulos", () => {
    expect(buildLegiscastStructureTree([node(2, "Capítulo 2", null, 2), node(1, "Capítulo 1", null, 1)]).map((item) => item.nome)).toEqual(["Capítulo 1", "Capítulo 2"]);
  });

  it("ordena exclusivamente por parent_id e ordem em cada nível da árvore", () => {
    const tree = buildLegiscastStructureTree([
      node(20, "Título 02", null, 2, "titulo"),
      node(22, "Capítulo 02 do Título 02", 20, 2),
      node(11, "Capítulo 01 do Título 01", 10, 1),
      node(10, "Título 01", null, 1, "titulo"),
      node(21, "Capítulo 01 do Título 02", 20, 1),
      node(12, "Capítulo 02 do Título 01", 10, 2),
    ]);

    expect(tree.map((item) => item.nome)).toEqual(["Título 01", "Título 02"]);
    expect(tree[0].children.map((item) => item.nome)).toEqual(["Capítulo 01 do Título 01", "Capítulo 02 do Título 01"]);
    expect(tree[1].children.map((item) => item.nome)).toEqual(["Capítulo 01 do Título 02", "Capítulo 02 do Título 02"]);
  });

  it("aplica a mesma regra a níveis profundos", () => {
    const tree = buildLegiscastStructureTree([
      node(4, "Subseção 02", 2, 2, "subsecao"),
      node(1, "Título", null, 1, "titulo"),
      node(3, "Subseção 01", 2, 1, "subsecao"),
      node(2, "Seção", 1, 1, "secao"),
    ]);
    expect(tree[0].children[0].children.map((item) => item.nome)).toEqual(["Subseção 01", "Subseção 02"]);
  });

  it("não usa nome ou id como regra paralela quando irmãos têm a mesma ordem", () => {
    const tree = buildLegiscastStructureTree([node(9, "Primeiro inserido", null, 1), node(1, "Segundo inserido", null, 1)]);
    expect(tree.map((item) => item.nome)).toEqual(["Primeiro inserido", "Segundo inserido"]);
  });

  it("mantém seleção e autoplay fora da construção da ordem visual", () => {
    expect(player).toContain("buildLegiscastStructureTree(structure), [structure]");
    expect(player).toContain('aria-current={active ? "true" : undefined}');
    expect(player).toContain("if (index < tracks.length - 1) setIndex(index + 1)");
    expect(player).not.toContain("buildLegiscastStructureTree([...structure]");
  });

  it("preserva pdf_page em nós com e sem filhos", () => {
    const tree = buildLegiscastStructureTree([
      { ...node(1, "Título I", null, 1, "titulo"), pdf_page: 3 },
      { ...node(2, "Capítulo I", 1, 1), pdf_page: 8 },
    ]);
    expect(tree[0].pdf_page).toBe(3);
    expect(tree[0].children[0].pdf_page).toBe(8);
  });
});
