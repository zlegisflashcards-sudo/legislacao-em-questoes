import { describe, expect, it } from "vitest";
import { buildAdministrativePreviewItems, findAdministrativeShadowArticles } from "./admin-legislative-preview-core";

describe("prévia administrativa da legislação", () => {
  it("agrupa questões pela Ordem, preserva referência preparada e não inventa blocos vazios", () => {
    const result = buildAdministrativePreviewItems("cf", [{ id: "ref-1", slug: "cf", ordem: "0001.0.00.0.00.0", identificacao: "Art. 1º, CF", legislacao: "Art. 1º", situacao: "preparada", lei_revogadora: null }], [
      { id: "q-1", ordem: "0001.0.00.0.00.0", assunto: "Art. 1º, CF" },
      { id: "q-2", ordem: "0001.0.00.0.00.0", assunto: "Art. 1º, CF" },
      { id: "q-3", ordem: "0003.0.00.0.00.0", assunto: "Art. 3º, CF" },
    ]);
    expect(result.items.map((item) => item.ordem)).toEqual(["0001.0.00.0.00.0"]);
    expect(result.items[0]).toMatchObject({ status: "prepared", questionCount: 2, pendingQuestionCount: 0 });
  });

  it("identifica artigo sombra apenas ao comparar o inventário oficial com a base preparada", () => {
    const result = findAdministrativeShadowArticles([
      { ordem: "0001.0.00.0.00.0", identificacao: "Art. 1º", legislacao: "Art. 1º" },
      { ordem: "0002.0.00.0.00.0", identificacao: "Art. 2º", legislacao: "Art. 2º" },
    ], [{ id: "ref-1", slug: "lei", ordem: "0001.0.00.0.00.0", identificacao: "Art. 1º", legislacao: "texto", situacao: "preparada", lei_revogadora: null }]);
    expect(result).toEqual([{ ordem: "0002.0.00.0.00.0", identification: "Art. 2º" }]);
  });

  it("preserva o estado revogado e separa questões sem Ordem canônica", () => {
    const result = buildAdministrativePreviewItems("cf", [{ id: "ref-2", slug: "cf", ordem: "0002.0.00.0.00.0", identificacao: "Art. 2º, CF", legislacao: "texto guardado", situacao: "revogada", lei_revogadora: "Lei nº 1/2026" }], [
      { id: "q-invalid", ordem: "artigo dois", assunto: "Art. 2º, CF" },
    ]);
    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toMatchObject({ status: "revoked", revokingLaw: "Lei nº 1/2026", questionCount: 0 });
    expect(result.unresolvedQuestionCount).toBe(1);
  });

  it("não cria pendência autônoma para inciso coberto pelo artigo preparado", () => {
    const result = buildAdministrativePreviewItems("cf", [
      { id: "art-5", slug: "cf", ordem: "0005.0.00.0.00.0", identificacao: "Art. 5º, CF", legislacao: "Art. 5º", situacao: "preparada", lei_revogadora: null },
      { id: "inciso-37", slug: "cf", ordem: "0005.0.00.0.37.0", identificacao: "Art. 5º, XXXVII, CF", legislacao: "recorte da questão", situacao: "preparada", lei_revogadora: null },
    ], [{ id: "q-37", ordem: "0005.0.00.0.37.0", assunto: "Art. 5º, XXXVII, CF" }]);
    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toMatchObject({ ordem: "0005.0.00.0.00.0", questionCount: 1, status: "prepared" });
  });
});
