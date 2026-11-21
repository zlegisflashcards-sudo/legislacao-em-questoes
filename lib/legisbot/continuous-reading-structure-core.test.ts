import { describe, expect, it } from "vitest";
import {
  continuousReadingReferenceIdsForStructureScope,
  continuousReadingStructureDescendantIds,
  continuousReadingStructurePath,
  hasContinuousReadingStructures,
  orderContinuousReadingReferences,
  orderContinuousReadingStructures,
  resolveContinuousReadingReferenceStructureAssociations,
  resolveContinuousReadingStructureReadiness,
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

  it("só trava a leitura do aluno para bloco preparado sem resolução segura", () => {
    const associations = resolveContinuousReadingReferenceStructureAssociations({
      references: [
        { id: "manual", sourceQuestionId: null, structureId: 11 },
        { id: "inferido", sourceQuestionId: null, structureId: null },
        { id: "ambiguo", sourceQuestionId: null, structureId: null },
        { id: "sem-destino", sourceQuestionId: null, structureId: null },
        { id: "nao-preparado", sourceQuestionId: null, structureId: null },
      ],
      questions: [{ id: "q-unica", structureId: 11 }, { id: "q-a", structureId: 11 }, { id: "q-b", structureId: 12 }],
      resolutions: [
        { questionId: "q-unica", referenceId: "inferido" },
        { questionId: "q-a", referenceId: "ambiguo" },
        { questionId: "q-b", referenceId: "ambiguo" },
      ],
      structures,
    });
    expect(resolveContinuousReadingStructureReadiness({
      structures,
      references: [
        { id: "manual", prepared: true },
        { id: "inferido", prepared: true },
        { id: "ambiguo", prepared: true },
        { id: "sem-destino", prepared: true },
        { id: "nao-preparado", prepared: false },
      ],
      associations,
    })).toEqual({ ready: false, unresolvedPreparedReferenceIds: ["ambiguo", "sem-destino"] });
  });

  it("preserva leis sem hierarquia e não trata bloco arquivado como pendência", () => {
    expect(resolveContinuousReadingStructureReadiness({
      structures: [],
      references: [{ id: "legado", prepared: true }],
      associations: [],
    })).toEqual({ ready: true, unresolvedPreparedReferenceIds: [] });
    expect(resolveContinuousReadingStructureReadiness({
      structures,
      references: [{ id: "arquivado", prepared: true, archived: true }],
      associations: [],
    })).toEqual({ ready: true, unresolvedPreparedReferenceIds: [] });
  });

  it("mantém o Plano Diretor de Contagem acessível quando todos os blocos estão resolvidos", () => {
    // Contrato de regressão para lcp362comg: a ausência de structure_id em um
    // bloco não basta para bloquear a lei se as evidências apontarem para um
    // único nó do sumário.
    const planoDiretorStructures = [{ id: 362, parentId: null, ordem: 1 }];
    const associations = resolveContinuousReadingReferenceStructureAssociations({
      references: [
        { id: "vinculo-editorial", sourceQuestionId: null, structureId: 362 },
        { id: "vinculo-inferido", sourceQuestionId: null, structureId: null },
      ],
      questions: [{ id: "questao-plano-diretor", structureId: 362 }],
      resolutions: [{ questionId: "questao-plano-diretor", referenceId: "vinculo-inferido" }],
      structures: planoDiretorStructures,
    });
    expect(resolveContinuousReadingStructureReadiness({
      structures: planoDiretorStructures,
      references: [{ id: "vinculo-editorial", prepared: true }, { id: "vinculo-inferido", prepared: true }],
      associations,
    })).toEqual({ ready: true, unresolvedPreparedReferenceIds: [] });
  });

  it("mantém a sequência legislativa previsível", () => {
    expect(orderContinuousReadingReferences([
      { id: "c", ordem: "0010.0.00.0.00.0" },
      { id: "b", ordem: "0002.0.00.0.00.0" },
      { id: "a", ordem: "0001.0.00.0.00.0" },
    ]).map((reference) => reference.id)).toEqual(["a", "b", "c"]);
  });

  it("ordena o seletor editorial pela árvore, e não pela ordem plana de cadastro", () => {
    const unordered = [
      { id: 12, parentId: 10, ordem: 2 },
      { id: 20, parentId: null, ordem: 2 },
      { id: 11, parentId: 10, ordem: 1 },
      { id: 10, parentId: null, ordem: 1 },
      { id: 30, parentId: 999, ordem: 3 },
    ];
    expect(orderContinuousReadingStructures(unordered).map((node) => node.id)).toEqual([10, 11, 12, 20, 30]);
  });
});
