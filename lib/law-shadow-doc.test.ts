import { describe, expect, it } from "vitest";
import { extractLawShadowUnits, googleDocumentId, pastedLawTextToDocument, publicGoogleDocsHtmlToDocument, readPublicGoogleDocument } from "./law-shadow-doc";

const paragraph = (content: string, options: { bold?: boolean; heading?: boolean | number } = {}) => ({ paragraph: { paragraphStyle: { namedStyleType: options.heading ? `HEADING_${options.heading === true ? 1 : options.heading}` : "NORMAL_TEXT" }, elements: [{ textRun: { content, textStyle: { bold: Boolean(options.bold) } } }] } });

describe("Artigo Sombra a partir do Google Docs", () => {
  it("aceita URL de documento, inclusive a variante copiada com perfil, não preview ou arquivo do Drive", () => {
    expect(googleDocumentId("https://docs.google.com/document/d/abc_123/edit")).toBe("abc_123");
    expect(googleDocumentId("https://docs.google.com/document/u/0/d/abc_123/edit?usp=sharing")).toBe("abc_123");
    expect(googleDocumentId("https://drive.google.com/file/d/abc_123/view")).toBeNull();
    expect(googleDocumentId("https://docs.google.com/spreadsheets/d/abc/edit")).toBeNull();
  });

  it("separa caput, parágrafo único e parágrafo numerado sem transformar incisos em unidades", () => {
    const result = extractLawShadowUnits({ body: { content: [
      paragraph("PARTE GERAL", { heading: true }),
      paragraph("Art. 1º A lei penal não retroagirá, salvo para beneficiar o réu.", { bold: true }),
      paragraph("I - remissão interna não inicia outro artigo."),
      paragraph("§ único. A regra também se aplica."),
      paragraph("a) alínea do parágrafo."),
      paragraph("§ 2º-A. Regra especial."),
    ] } });
    expect(result.units).toHaveLength(3);
    expect(result.units.map((unit) => unit.assunto)).toEqual(["Art. 1", "Art. 1, § único", "Art. 1, § 2º-A"]);
    expect(result.units.map((unit) => unit.ordem)).toEqual(["0001.0.00.0.00.0", "0001.0.01.0.00.0", "0001.0.02.a.00.0"]);
    expect(result.units[0].texto_html).toContain("<strong>Art. 1º");
    expect(result.units[1].texto_plano).toContain("alínea do parágrafo");
    expect(result.units[0].caminho_estrutural).toEqual(["PARTE GERAL"]);
  });

  it("mantém tabelas na unidade atual e não cria artigo por remissão", () => {
    const result = extractLawShadowUnits({ body: { content: [
      paragraph("Art. 10. Veja o art. 11 para outra hipótese."),
      { table: { tableRows: [{ tableCells: [{ content: [paragraph("Quadro de referência") ] }] }] } },
      paragraph("Art. 11. Dispositivo seguinte."),
    ] } });
    expect(result.units).toHaveLength(2);
    expect(result.units[0].texto_html).toContain("<table>");
    expect(result.units.map((unit) => unit.assunto)).toEqual(["Art. 10", "Art. 11"]);
  });

  it("preserva uma trilha estrutural por níveis de título", () => {
    const result = extractLawShadowUnits({ body: { content: [
      paragraph("PARTE ESPECIAL", { heading: 1 }), paragraph("TÍTULO I", { heading: 2 }), paragraph("Art. 20. Texto."),
      paragraph("TÍTULO II", { heading: 2 }), paragraph("Art. 21. Outro texto."),
    ] } });
    expect(result.units[0].caminho_estrutural).toEqual(["PARTE ESPECIAL", "TÍTULO I"]);
    expect(result.units[1].caminho_estrutural).toEqual(["PARTE ESPECIAL", "TÍTULO II"]);
  });

  it("lê a exportação pública HTML preservando parágrafos, negrito e tabela", () => {
    const document = publicGoogleDocsHtmlToDocument(`<!doctype html><html><body>
      <h1>PARTE GERAL</h1><p><b>Art. 1º</b> Texto do caput.</p><p>§ único. Texto do parágrafo.</p>
      <table><tr><td><p>Quadro de referência</p></td></tr></table>
    </body></html>`, "doc_publico");
    const result = extractLawShadowUnits(document);
    expect(result.units.map((unit) => unit.assunto)).toEqual(["Art. 1", "Art. 1, § único"]);
    expect(result.units[0].texto_html).toContain("<b>Art. 1º</b>");
    expect(result.units[1].texto_html).toContain("<table>");
  });

  it("recusa uma página pública que é, na verdade, tela de login ou permissão", async () => {
    const response = new Response("<html><body>Sign in to continue</body></html>", { status: 200, headers: { "content-type": "text/html" } });
    Object.defineProperty(response, "url", { value: "https://docs.google.com/document/d/doc/export?format=html" });
    await expect(readPublicGoogleDocument("doc", async () => response)).rejects.toMatchObject({ status: 403 });
  });

  it("extrai caput e parágrafos de texto legal colado sem inventar unidades para incisos", () => {
    const result = extractLawShadowUnits(pastedLawTextToDocument(`TÍTULO I\n\nArt. 1º Texto do caput.\nI - inciso do caput.\n§ 1º Texto do parágrafo.\na) alínea do parágrafo.\n\nArt. 2º Segundo artigo.`));
    expect(result.units.map((unit) => unit.assunto)).toEqual(["Art. 1", "Art. 1, § 1º", "Art. 2"]);
    expect(result.units[0].texto_plano).toContain("inciso do caput");
    expect(result.units[1].texto_plano).toContain("alínea do parágrafo");
  });
});
