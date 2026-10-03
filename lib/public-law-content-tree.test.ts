import { describe, expect, it } from "vitest";
import { buildPublicLawContentTree } from "./public-law-content-tree";

const structure = [
  { id: 1, parent_id: null, tipo: "titulo", nome: "Título I", ordem: 1 },
  { id: 2, parent_id: 1, tipo: "capitulo", nome: "Capítulo I", ordem: 1 },
  { id: 3, parent_id: 2, tipo: "secao", nome: "Seção I", ordem: 1 },
  { id: 4, parent_id: 1, tipo: "capitulo", nome: "Capítulo II", ordem: 2 },
  { id: 5, parent_id: null, tipo: "titulo", nome: "Título II", ordem: 2 },
];

describe("projeção pública do conteúdo estrutural da lei", () => {
  it("agrega questões e áudio do próprio nó e de todos os descendentes", () => {
    const tree = buildPublicLawContentTree({
      structure,
      questions: [{ structure_id: 2 }, { structure_id: 3 }, { structure_id: 3 }, { structure_id: 4 }, { structure_id: null }],
      audios: [{ structure_id: 3 }],
    });

    expect(tree[0]).toMatchObject({ questionCount: 4, hasLegiscast: true });
    expect(tree[0].children[0]).toMatchObject({ questionCount: 3, hasLegiscast: true });
    expect(tree[0].children[0].children[0]).toMatchObject({ questionCount: 2, hasLegiscast: true });
    expect(tree[0].children[1]).toMatchObject({ questionCount: 1, hasLegiscast: false });
    expect(tree[1]).toMatchObject({ questionCount: 0, hasLegiscast: false });
  });

  it("preserva a ordenação e todos os nós estruturais na lei completa", () => {
    const tree = buildPublicLawContentTree({ structure: [...structure].reverse(), questions: [], audios: [] });
    expect(tree.map((node) => node.nome)).toEqual(["Título I", "Título II"]);
    expect(tree[0].children.map((node) => node.nome)).toEqual(["Capítulo I", "Capítulo II"]);
  });

  it("mantém Não se aplica como estado próprio, distinto do áudio, e o agrega aos ancestrais", () => {
    const tree = buildPublicLawContentTree({
      structure: structure.map((node) => node.id === 3 ? { ...node, audio_not_applicable: true } : node),
      questions: [],
      audios: [],
    });

    expect(tree[0]).toMatchObject({ hasOwnLegiscast: false, audioNotApplicable: false, hasLegiscast: true });
    expect(tree[0].children[0]).toMatchObject({ hasOwnLegiscast: false, audioNotApplicable: false, hasLegiscast: true });
    expect(tree[0].children[0].children[0]).toMatchObject({ hasOwnLegiscast: false, audioNotApplicable: true, hasLegiscast: true });
  });

  it("em recorte, mantém ancestrais visuais mas agrega somente o universo autorizado", () => {
    const tree = buildPublicLawContentTree({
      structure,
      scopeStructureIds: [3],
      questions: [{ structure_id: 2 }, { structure_id: 3 }, { structure_id: 4 }],
      audios: [{ structure_id: 2 }, { structure_id: 3 }, { structure_id: 4 }],
    });

    expect(tree).toHaveLength(1);
    expect(tree[0]).toMatchObject({ id: 1, questionCount: 1, hasLegiscast: true });
    expect(tree[0].children).toHaveLength(1);
    expect(tree[0].children[0]).toMatchObject({ id: 2, questionCount: 1, hasLegiscast: true });
    expect(tree[0].children[0].children[0]).toMatchObject({ id: 3, questionCount: 1, hasLegiscast: true });
  });

  it("inclui descendentes do nó selecionado no recorte", () => {
    const tree = buildPublicLawContentTree({
      structure,
      scopeStructureIds: [2],
      questions: [{ structure_id: 2 }, { structure_id: 3 }, { structure_id: 4 }],
      audios: [{ structure_id: 3 }, { structure_id: 4 }],
    });

    expect(tree[0]).toMatchObject({ questionCount: 2, hasLegiscast: true });
    expect(tree[0].children.map((node) => node.id)).toEqual([2]);
    expect(tree[0].children[0]).toMatchObject({ questionCount: 2, hasLegiscast: true });
  });
});
