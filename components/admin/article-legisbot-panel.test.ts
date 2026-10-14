import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const panel = readFileSync("components/admin/article-legisbot-panel.tsx", "utf8");

describe("ArticleLegisBotPanel", () => {
  it("não usa conflitos de questões para liberar o LegisBot", () => {
    expect(panel).toContain("reference?.legislation?.trim()");
    expect(panel).toContain("independente dos conflitos das questões");
    expect(panel).not.toContain("trusted");
    expect(panel).not.toContain("Abrir conflitos");
  });

  it("oferece criação manual e API quando a base está preparada", () => {
    expect(panel).toContain("prepararContextoLegisBot");
    expect(panel).toContain("Gerar com API");
    expect(panel).toContain("gerarComentarioLegisBotAdministrativo");
    expect(panel).toContain("Criar conteúdo manualmente");
    expect(panel).toContain("Gerar com API");
  });

  it("mantém o editor salvo prioritário e explica ausência da base", () => {
    expect(panel).toContain("record ? <LegisBotEditor");
    expect(panel).toContain("Legislação preparada necessária");
    expect(panel).toContain("Conflitos das questões não impedem este fluxo");
  });

  it("mantém a tentativa pela API disponível para registros sem conteúdo", () => {
    const editor = readFileSync("components/admin/legisbot-editor.tsx", "utf8");
    expect(editor).toContain("Tentar gerar com API");
    expect(editor).toContain("gerarComentarioLegisBotAdministrativo");
  });
});
