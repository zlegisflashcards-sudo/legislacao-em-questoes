import { describe, expect, it } from "vitest";
import { previewDoctrineImport, type DoctrineImportRow } from "./doctrine-import-contract";

const row = (overrides: Partial<DoctrineImportRow> = {}): DoctrineImportRow => ({
  IDQuestao: "7ea93a63-951d-4f08-b90f-d3d460981a50",
  titulo: "Direito Administrativo", estrutura: "", assunto: "Administração Pública", ordem: "001", totalAssuntos: "105",
  pergunta: "A assertiva está correta.", resposta: "Certo", justificativa: "Fundamento.", resumo: "Resumo.", referencia: "", versao: "",
  deck: ["Direito Administrativo", "01 - Noções de Estado, governo e Administração Pública"],
  ...overrides,
});

describe("contrato de importação de doutrina", () => {
  it("preserva tópico e ordem global sem convertê-los em artigo", () => {
    const preview = previewDoctrineImport([row(), row({ IDQuestao: "d7944fb5-541a-4866-9b63-4fb092059780", assunto: "Poderes administrativos", ordem: "002" })]);
    expect(preview.issues).toEqual([]);
    expect(preview.topicCount).toBe(2);
    expect(preview.structureCount).toBe(1);
    expect(preview.orders).toEqual(["001", "002"]);
  });

  it("prefere a hierarquia do deck à estrutura vazia do card", () => {
    expect(previewDoctrineImport([row()]).issues).toEqual([]);
  });

  it("rejeita UUID duplicado, ordem não global e resposta inválida", () => {
    const preview = previewDoctrineImport([row(), row({ ordem: "1.0.00", resposta: "Talvez" })]);
    expect(preview.issues.map((issue) => issue.field)).toEqual(expect.arrayContaining(["IDQuestao", "ordem", "resposta"]));
  });

  it("não aceita card sem localização", () => {
    const preview = previewDoctrineImport([row({ deck: [], estrutura: "" })]);
    expect(preview.issues).toContainEqual(expect.objectContaining({ field: "deck" }));
  });
});
