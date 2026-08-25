import { describe, expect, it } from "vitest";
import { legacyQuestionStructurePath, questionStructurePath } from "./question-structure-path";

const nodes = [
  { id: 1, parent_id: null, tipo: "titulo" as const, nome: "Título 01 - Da Polícia Militar" },
  { id: 2, parent_id: 1, tipo: "capitulo" as const, nome: "Capítulo 01 - Das Disposições Preliminares" },
  { id: 3, parent_id: 2, tipo: "secao" as const, nome: "Seção 02 - Do Estado-Maior" },
  { id: 4, parent_id: 3, tipo: "subsecao" as const, nome: "Subseção 01 - Geral" },
];

describe("caminho estrutural de questões", () => {
  it("reconstrói título, capítulo, seção e subseção pelo parent_id", () => {
    expect(questionStructurePath(nodes, 4).map((node) => node.nome)).toEqual(nodes.map((node) => node.nome));
  });

  it("aceita capítulo sem título e não inventa ancestrais", () => {
    expect(questionStructurePath([{ id: 8, parent_id: null, tipo: "capitulo", nome: "Capítulo único" }], 8).map((node) => node.nome)).toEqual(["Capítulo único"]);
  });

  it("não quebra com structure_id ausente, inválido ou cíclico", () => {
    expect(questionStructurePath(nodes, null)).toEqual([]);
    expect(questionStructurePath(nodes, 99)).toEqual([]);
    expect(questionStructurePath([{ id: 9, parent_id: 9, nome: "Ciclo" }], 9).map((node) => node.nome)).toEqual(["Ciclo"]);
  });

  it("mantém o fallback textual somente quando a estrutura não puder ser resolvida", () => {
    expect(legacyQuestionStructurePath({ capitulo: "Capítulo legado", secao: "Seção legada" }).map((node) => node.nome)).toEqual(["Capítulo legado", "Seção legada"]);
  });
});
