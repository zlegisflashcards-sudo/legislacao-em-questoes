import { strToU8, zipSync } from "fflate";
import { describe, expect, it } from "vitest";
import { legislativeDocumentParagraphs, parseLegislativeDocument } from "./legislative-document-import";

describe("importação de documento legislativo", () => {
  it("cria referências independentes para artigo e sua hierarquia", () => {
    const result = parseLegislativeDocument([
      "Art. 27-B", "Caput do artigo.", "§ 1º-C", "Texto do parágrafo.", "II", "Texto do inciso.", "a)", "Texto da alínea.",
    ]);
    expect(result.rejected).toEqual([]);
    expect(result.references.map((item) => item.ordem)).toEqual(["0027.b.00.0.00.0", "0027.b.01.c.00.0", "0027.b.01.c.02.0", "0027.b.01.c.02.a"]);
    expect(result.references[2].legislation).toBe("Texto do inciso.");
  });

  it("não aceita texto sem um título estrutural", () => {
    const result = parseLegislativeDocument(["Texto solto", "Art. 1º", "Caput."]);
    expect(result.references).toHaveLength(1);
    expect(result.rejected[0]).toContain("texto fora");
  });

  it("preserva negrito, itálico, cor, quebras e tabelas da origem DOCX", () => {
    const documentXml = `<?xml version="1.0"?><w:document xmlns:w="x"><w:body>
      <w:p><w:r><w:t>Art. 2º</w:t></w:r></w:p>
      <w:p><w:r><w:rPr><w:b/></w:rPr><w:t>Texto em negrito</w:t></w:r><w:r><w:br/><w:rPr><w:i/><w:color w:val="1D4ED8"/></w:rPr><w:t>linha colorida</w:t></w:r></w:p>
      <w:tbl><w:tr><w:tc><w:p><w:r><w:t>Coluna A</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>Coluna B</w:t></w:r></w:p></w:tc></w:tr></w:tbl>
    </w:body></w:document>`;
    const bytes = zipSync({ "word/document.xml": strToU8(documentXml) });
    const paragraphs = legislativeDocumentParagraphs("lei.docx", bytes);
    const parsed = parseLegislativeDocument(paragraphs);
    expect(parsed.references).toHaveLength(1);
    expect(parsed.references[0].legislation).toContain("<strong>Texto em negrito</strong>");
    expect(parsed.references[0].legislation).toContain('<span style="color:#1D4ED8"><em><br>linha colorida</em></span>');
    expect(parsed.references[0].legislation).toContain("<table>");
    expect(parsed.references[0].legislation).toContain("<td>Coluna A</td>");
  });
});
