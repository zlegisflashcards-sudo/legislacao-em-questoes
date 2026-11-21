import { describe, expect, it } from "vitest";
import { resolveContinuousReadingStructureIntegrity } from "./continuous-reading-structure-integrity-core";

const structures = [
  { id: 1, parentId: null, ordem: 1, nome: "Título I" },
  { id: 2, parentId: 1, ordem: 1, nome: "Capítulo I" },
  { id: 3, parentId: 1, ordem: 2, nome: "Capítulo II" },
];
const editorial = (referenceId: string, structureId: number) => ({ referenceId, structureId, status: "editorial" as const, candidateStructureIds: [structureId], suggestionStatus: "associated" as const, suggestedStructureId: structureId });
type IntegrityInput = Parameters<typeof resolveContinuousReadingStructureIntegrity>[0];

const base = (): IntegrityInput => ({
  structures,
  questions: [{ id: "q1", structureId: 2 }],
  references: [{ id: "r1", ordem: "0001.0.00.0.00.0", prepared: true }],
  resolutions: [{ questionId: "q1", status: "hierarchy" as const, referenceId: "r1", ordem: "0001.0.00.0.00.0", reason: null }],
  associations: [editorial("r1", 2)],
  inventoryAvailable: true,
  inventory: [{ ordem: "0001.0.00.0.00.0" }],
});

describe("integridade estrutural da leitura contínua", () => {
  it("marca o recorte completo como ready, mantém irmã vazia e não libera o pai incompleto", () => {
    const result = resolveContinuousReadingStructureIntegrity(base());
    expect(result.reports.find((item) => item.structureId === 2)?.status).toBe("ready");
    expect(result.reports.find((item) => item.structureId === 1)).toMatchObject({ status: "pending_blocks", reasons: expect.arrayContaining(["descendant_empty"]) });
    expect(result.reports.find((item) => item.structureId === 3)?.status).toBe("empty");
  });

  it("inclui descendentes sem incluir estruturas irmãs", () => {
    const result = resolveContinuousReadingStructureIntegrity(base());
    expect(result.reports.find((item) => item.structureId === 1)?.activeQuestionCount).toBe(1);
    expect(result.reports.find((item) => item.structureId === 3)?.activeQuestionCount).toBe(0);
  });

  it("agrega evidência dos filhos reais sem marcar pai intermediário como vazio", () => {
    const nested = [
      { id: 1, parentId: null, ordem: 1 },
      { id: 2, parentId: 1, ordem: 1 },
      { id: 3, parentId: 2, ordem: 1 },
    ];
    const result = resolveContinuousReadingStructureIntegrity({
      ...base(),
      structures: nested,
      questions: [{ id: "q1", structureId: 3 }],
      associations: [editorial("r1", 3)],
    });
    expect(result.reports.find((item) => item.structureId === 1)).toMatchObject({ status: "ready", reasons: [] });
    expect(result.reports.find((item) => item.structureId === 2)).toMatchObject({ status: "ready", reasons: [] });
  });

  it("mantém a falta real de uma folha como bloqueio", () => {
    const result = resolveContinuousReadingStructureIntegrity({
      ...base(),
      structures: [
        { id: 1, parentId: null, ordem: 1 },
        { id: 2, parentId: 1, ordem: 1 },
        { id: 3, parentId: 1, ordem: 2 },
      ],
      associations: [editorial("r1", 2)],
    });
    expect(result.reports.find((item) => item.structureId === 1)?.reasons).toContain("descendant_empty");
  });

  it("lista os relatórios na ordem do sumário, mesmo se a consulta vier embaralhada", () => {
    const unordered = [
      { id: 4, parentId: 2, ordem: 2, nome: "Seção II" },
      { id: 3, parentId: 1, ordem: 2, nome: "Capítulo II" },
      { id: 1, parentId: null, ordem: 1, nome: "Título I" },
      { id: 2, parentId: 1, ordem: 1, nome: "Capítulo I" },
      { id: 5, parentId: 2, ordem: 1, nome: "Seção I" },
    ];
    const result = resolveContinuousReadingStructureIntegrity({ ...base(), structures: unordered });
    expect(result.reports.map((item) => item.structureId)).toEqual([1, 2, 5, 4, 3]);
  });

  it("aponta questão órfã do recorte e órfã sem estrutura como pendência não atribuída", () => {
    const input = base();
    input.resolutions = [{ questionId: "q1", status: "missing", referenceId: null, ordem: null, reason: "ausente" }];
    const local = resolveContinuousReadingStructureIntegrity(input);
    expect(local.reports.find((item) => item.structureId === 2)?.status).toBe("orphan_questions");
    const unassigned = resolveContinuousReadingStructureIntegrity({ ...input, questions: [{ id: "q-sem-estrutura", structureId: null }], resolutions: [{ questionId: "q-sem-estrutura", status: "missing", referenceId: null, ordem: null, reason: "ausente" }] });
    expect(unassigned.unassigned.orphanQuestionIds).toEqual(["q-sem-estrutura"]);
    expect(unassigned.reports.every((item) => item.status !== "ready")).toBe(true);
  });

  it("não aprova bloco não preparado ou associação ambígua, mas mantém o inventário como aviso", () => {
    const unprepared = base();
    unprepared.references = [{ ...unprepared.references[0], prepared: false }];
    expect(resolveContinuousReadingStructureIntegrity(unprepared).reports.find((item) => item.structureId === 2)?.reasons).toContain("reference_unprepared");
    const ambiguous = base();
    ambiguous.associations = [{ referenceId: "r1", structureId: null, status: "ambiguous", candidateStructureIds: [2, 3], suggestionStatus: "ambiguous", suggestedStructureId: null }];
    expect(resolveContinuousReadingStructureIntegrity(ambiguous).reports.find((item) => item.structureId === 2)?.status).toBe("ambiguous");
    const inventory = resolveContinuousReadingStructureIntegrity({ ...base(), inventory: [{ ordem: "0099.0.00.0.00.0" }] });
    expect(inventory.unassigned.inventoryOrders).toEqual(["0099.0.00.0.00.0"]);
    expect(inventory.reports.find((item) => item.structureId === 2)?.status).toBe("ready");
  });

  it("mantém leis sem hierarquia compatíveis e pendentes de diagnóstico estrutural", () => {
    const result = resolveContinuousReadingStructureIntegrity({ ...base(), structures: [] });
    expect(result).toEqual({ hasStructures: false, reports: [], unassigned: { orphanQuestionIds: [], referenceIds: [], inventoryOrders: [] } });
  });

  it("não bloqueia a estrutura quando o inventário oficial está indisponível", () => {
    const result = resolveContinuousReadingStructureIntegrity({ ...base(), inventoryAvailable: false, inventory: [] });
    expect(result.reports.find((item) => item.structureId === 2)).toMatchObject({ status: "ready", reasons: [] });
  });
});
