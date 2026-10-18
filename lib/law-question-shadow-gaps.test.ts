import { describe, expect, it } from "vitest";
import { findLawQuestionStructureGaps } from "./law-question-shadow-gaps";

describe("lacunas automáticas para Questões Sombra", () => {
  const nodes = [
    { id: 1, parent_id: null, tipo: "titulo" as const, nome: "Título I", ordem: 1 },
    { id: 2, parent_id: 1, tipo: "capitulo" as const, nome: "Capítulo I", ordem: 1 },
    { id: 3, parent_id: 1, tipo: "capitulo" as const, nome: "Capítulo II", ordem: 2 },
  ];

  it("cria sombras para blocos finais sem questão ativa", () => {
    expect(findLawQuestionStructureGaps(nodes, [{ structure_id: 2 }])).toEqual([
      expect.objectContaining({ structureId: 3, assunto: "Capítulo II", identityKey: "automatic-structure:3", path: ["Título I", "Capítulo II"] }),
    ]);
  });

  it("não cria sombra para bloco pai que já possui subtópicos", () => {
    expect(findLawQuestionStructureGaps(nodes, [])).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ structureId: 1 }),
    ]));
  });

  it("não depende de lacunas na numeração da Ordem", () => {
    expect(findLawQuestionStructureGaps([], [{ structure_id: null }])).toEqual([]);
  });
});
