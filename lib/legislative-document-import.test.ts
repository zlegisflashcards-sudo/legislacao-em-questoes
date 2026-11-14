import { strToU8, zipSync } from "fflate";
import { describe, expect, it } from "vitest";
import { canonicalStructureName, legislativeDocumentParagraphs, parseLegislativeDocument } from "./legislative-document-import";

describe("importação de documento legislativo", () => {
  it("reconhece a mesma estrutura com ordinal romano ou numérico", () => {
    expect(canonicalStructureName("CAPÍTULO I - DISPOSIÇÕES PRELIMINARES")).toBe(
      canonicalStructureName("CAPÍTULO 01 - DISPOSIÇÕES PRELIMINARES"),
    );
    expect(canonicalStructureName("Seção II — Do Processo")).toBe(
      canonicalStructureName("SEÇÃO 02 - DO PROCESSO"),
    );
  });

  it("cria blocos independentes para artigo e parágrafo numerado, mantendo incisos no fluxo", () => {
    const result = parseLegislativeDocument([
      "# Art. 27-B", "Caput do artigo.", "# § 1º-C", "Texto do parágrafo.", "II", "Texto do inciso.", "a)", "Texto da alínea.",
    ]);
    expect(result.rejected).toEqual([]);
    expect(result.references.map((item) => item.ordem)).toEqual(["0027.b.00.0.00.0", "0027.b.01.c.00.0"]);
    expect(result.references[1].legislation).toContain("II\n\nTexto do inciso.");
    expect(result.references[1].legislation).toContain("a)\n\nTexto da alínea.");
  });

  it("mantém o parágrafo único no corpo do caput", () => {
    const result = parseLegislativeDocument(["# Art. 1º", "Caput.", "§ único.", "Texto complementar."]);
    expect(result.references).toHaveLength(1);
    expect(result.references[0].legislation).toContain("§ único.");
  });

  it("usa o título estrutural apenas para identificar o bloco, sem duplicá-lo no HTML salvo", () => {
    const result = parseLegislativeDocument([
      "# Art. 1º",
      "Art. 1º - Não há crime sem lei anterior que o defina.",
    ]);
    expect(result.references).toHaveLength(1);
    expect(result.references[0]).toMatchObject({ ordem: "0001.0.00.0.00.0", identification: "Art. 1º" });
    expect(result.references[0].legislation).toBe("Art. 1º - Não há crime sem lei anterior que o defina.");
    expect(result.references[0].legislation).not.toContain("# Art. 1º");
  });

  it("preserva a identificação visível quando o caput após o título não repete Art.", () => {
    const result = parseLegislativeDocument([
      "# Art. 1º",
      "Não há crime sem lei anterior que o defina.",
    ]);
    expect(result.references).toHaveLength(1);
    expect(result.references[0].legislation).toBe("Art. 1º Não há crime sem lei anterior que o defina.");
  });

  it("mantém o marcador de capítulo como evidência editorial sem gravá-lo no corpo", () => {
    const result = parseLegislativeDocument([
      "## CAPÍTULO I — DISPOSIÇÕES PRELIMINARES",
      "# Art. 1º",
      "Art. 1º Texto do caput.",
      "# Art. 2º",
      "Art. 2º Texto seguinte.",
    ]);
    expect(result.rejected).toEqual([]);
    expect(result.structureMarkers).toEqual(["CAPÍTULO I — DISPOSIÇÕES PRELIMINARES"]);
    expect(result.references.map((reference) => reference.structureTrail)).toEqual([
      ["CAPÍTULO I — DISPOSIÇÕES PRELIMINARES"],
      ["CAPÍTULO I — DISPOSIÇÕES PRELIMINARES"],
    ]);
    expect(result.references[0].legislation).not.toContain("CAPÍTULO I");
  });

  it("reconhece Título 2 do DOCX como marcador estrutural e mantém Título 1 como artigo", () => {
    const documentXml = `<?xml version="1.0"?><w:document xmlns:w="x"><w:body>
      <w:p><w:pPr><w:pStyle w:val="Heading2"/></w:pPr><w:r><w:t>CAPÍTULO I — DISPOSIÇÕES PRELIMINARES</w:t></w:r></w:p>
      <w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>Art. 1º</w:t></w:r></w:p>
      <w:p><w:r><w:t>Art. 1º Texto.</w:t></w:r></w:p>
    </w:body></w:document>`;
    const bytes = zipSync({ "word/document.xml": strToU8(documentXml) });
    const result = parseLegislativeDocument(legislativeDocumentParagraphs("lei.docx", bytes));
    expect(result.references).toHaveLength(1);
    expect(result.references[0].structureTrail).toEqual(["CAPÍTULO I — DISPOSIÇÕES PRELIMINARES"]);
    expect(result.references[0].legislation).toBe("<p>Art. 1º Texto.</p>");
  });

  it("não acrescenta o identificador quando o caput já o contém", () => {
    const result = parseLegislativeDocument([
      "# Art. 1º",
      "Art. 1º. Caput.",
      "# § 1º-C",
      "§ 1º-C. Texto do parágrafo.",
    ]);
    expect(result.references).toHaveLength(2);
    expect(result.references[1].legislation).toBe("§ 1º-C. Texto do parágrafo.");
  });

  it("mantém parágrafo e inciso no artigo quando não recebem título explícito", () => {
    const result = parseLegislativeDocument([
      "# Art. 1º",
      "Art. 1º Caput.",
      "§ 1º Parágrafo no mesmo bloco.",
      "II - Inciso no mesmo bloco.",
    ]);
    expect(result.references).toHaveLength(1);
    expect(result.references[0].ordem).toBe("0001.0.00.0.00.0");
    expect(result.references[0].legislation).toContain("§ 1º Parágrafo no mesmo bloco.");
    expect(result.references[0].legislation).toContain("II - Inciso no mesmo bloco.");
  });

  it("abre bloco para parágrafo ou inciso apenas quando recebem título explícito", () => {
    const result = parseLegislativeDocument([
      "# Art. 1º", "Art. 1º Caput.",
      "# § 2º", "§ 2º Texto próprio.",
      "# II", "II Texto próprio.",
    ]);
    expect(result.references.map((reference) => reference.ordem)).toEqual(["0001.0.00.0.00.0", "0001.0.02.0.00.0", "0001.0.02.0.02.0"]);
  });

  it("não aceita texto sem um título estrutural", () => {
    const result = parseLegislativeDocument(["Texto solto", "# Art. 1º", "Caput."]);
    expect(result.references).toHaveLength(1);
    expect(result.rejected[0]).toContain("texto fora");
  });

  it("preserva negrito, itálico, cor, quebras e tabelas da origem DOCX", () => {
    const documentXml = `<?xml version="1.0"?><w:document xmlns:w="x"><w:body>
      <w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>Art. 2º</w:t></w:r></w:p>
      <w:p><w:r><w:rPr><w:b/></w:rPr><w:t>Texto em negrito</w:t></w:r><w:r><w:br/><w:rPr><w:i/><w:color w:val="1D4ED8"/></w:rPr><w:t>linha colorida</w:t></w:r></w:p>
      <w:tbl><w:tr><w:tc><w:p><w:r><w:t>Coluna A</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>Coluna B</w:t></w:r></w:p></w:tc></w:tr></w:tbl>
    </w:body></w:document>`;
    const bytes = zipSync({ "word/document.xml": strToU8(documentXml) });
    const paragraphs = legislativeDocumentParagraphs("lei.docx", bytes);
    const parsed = parseLegislativeDocument(paragraphs);
    expect(parsed.references).toHaveLength(1);
    expect(parsed.references[0].legislation).not.toContain("<p>Art. 2º</p>");
    expect(parsed.references[0].legislation).toContain("<strong>Texto em negrito</strong>");
    expect(parsed.references[0].legislation).toContain('<span style="color:#1D4ED8"><em><br>linha colorida</em></span>');
    expect(parsed.references[0].legislation).toContain("<table>");
    expect(parsed.references[0].legislation).toContain("<td>Coluna A</td>");
  });
});
