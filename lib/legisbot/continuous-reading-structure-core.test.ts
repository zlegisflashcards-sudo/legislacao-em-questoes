import { describe, expect, it } from "vitest";
import {
  continuousReadingReferenceIdsForStructureScope,
  continuousReadingStructureDescendantIds,
  continuousReadingStructurePath,
  hasContinuousReadingStructures,
  orderContinuousReadingReferences,
  resolveContinuousReadingReferenceStructureAssociations,
} from "./continuous-reading-structure-core";

const structures = [
  { id: 10, parentId: null, ordem: 1, tipo: "titulo", nome: "Título I" },
  { id: 11, parentId: 10, ordem: 1, tipo: "capitulo", nome: "Capítulo I" },
  { id: 12, parentId: 10, ordem: 2, tipo: "capitulo", nome: "Capítulo II" },
  { id: 20, parentId: null, ordem: 2, tipo: "titulo", nome: "Título II" },
];

describe("estrutura da leitura contínua", () => {
  it("reconhece lei sem estruturas e preserva o caminho vazio", () => {
    expect(hasContinuousReadingStructures([])).toBe(false);
    expect(continuousReadingStructurePath(null, structures)).toEqual([]);
    expect(continuousReadingStructurePath(404, structures)).toEqual([]);
  });

  it("calcula caminho e descendentes sem incluir estruturas vizinhas", () => {
    expect(continuousReadingStructurePath(11, structures).map((node) => node.id)).toEqual([10, 11]);
    expect(continuousReadingStructureDescendantIds(10, structures)).toEqual([10, 11, 12]);
    expect(continuousReadingStructureDescendantIds(20, structures)).toEqual([20]);
  });

  it("associa bloco somente quando todas as questões concordam com a estrutura", () => {
    const associations = resolveContinuousReadingReferenceStructureAssociations({
      references: [
        { id: "r-seguro", sourceQuestionId: "q-1" },
        { id: "r-ambiguo", sourceQuestionId: null },
        { id: "r-pendente", sourceQuestionId: null },
      ],
      questions: [
        { id: "q-1", structureId: 11 },
        { id: "q-2", structureId: 11 },
        { id: "q-3", structureId: 12 },
        { id: "q-4", structureId: null },
      ],
      resolutions: [
        { questionId: "q-1", referenceId: "r-seguro" },
        { questionId: "q-2", referenceId: "r-seguro" },
        { questionId: "q-2", referenceId: "r-ambiguo" },
        { questionId: "q-3", referenceId: "r-ambiguo" },
        { questionId: "q-4", referenceId: "r-pendente" },
      ],
      structures,
    });

    expect(associations).toEqual([
      { referenceId: "r-seguro", structureId: 11, status: "associated", candidateStructureIds: [11], suggestionStatus: "associated", suggestedStructureId: 11 },
      { referenceId: "r-ambiguo", structureId: null, status: "ambiguous", candidateStructureIds: [11, 12], suggestionStatus: "ambiguous", suggestedStructureId: null },
      { referenceId: "r-pendente", structureId: null, status: "unassociated", candidateStructureIds: [], suggestionStatus: "unassociated", suggestedStructureId: null },
    ]);
    expect(continuousReadingReferenceIdsForStructureScope(10, structures, associations)).toEqual(["r-seguro"]);
  });

  it("prioriza o vínculo editorial confirmado e volta à sugestão quando ele é removido", () => {
    const input = {
      references: [{ id: "r-confirmado", sourceQuestionId: "q-1", structureId: 12 }],
      questions: [{ id: "q-1", structureId: 11 }],
      resolutions: [{ questionId: "q-1", referenceId: "r-confirmado" }],
      structures,
    };
    expect(resolveContinuousReadingReferenceStructureAssociations(input)).toEqual([{
      referenceId: "r-confirmado", structureId: 12, status: "editorial", candidateStructureIds: [11], suggestionStatus: "associated", suggestedStructureId: 11,
    }]);
    expect(resolveContinuousReadingReferenceStructureAssociations({ ...input, references: [{ ...input.references[0], structureId: null }] })).toEqual([{
      referenceId: "r-confirmado", structureId: 11, status: "associated", candidateStructureIds: [11], suggestionStatus: "associated", suggestedStructureId: 11,
    }]);
  });

  it("mantém a sequência legislativa previsível", () => {
    expect(orderContinuousReadingReferences([
      { id: "c", ordem: "0010.0.00.0.00.0" },
      { id: "b", ordem: "0002.0.00.0.00.0" },
      { id: "a", ordem: "0001.0.00.0.00.0" },
    ]).map((reference) => reference.id)).toEqual(["a", "b", "c"]);
  });
});
