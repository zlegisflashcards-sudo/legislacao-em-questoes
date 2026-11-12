import { describe, expect, it } from "vitest";
import { detectManualLegislativeReference, isCanonicalManualReferenceOrder, preserveManualLegislationLineBreaks } from "./manual-legislative-reference";

describe("detecção de bloco legislativo manual", () => {
  it("sugere a Ordem canônica para artigo com letra e parágrafo", () => {
    expect(detectManualLegislativeReference("Art. 18-A, § 1º. Texto do dispositivo.", "Lei nº 1.593/2026")).toEqual({
      suggestion: { identification: "Art. 18-A, § 1º, Lei nº 1.593/2026", ordem: "0018.a.01.0.00.0" },
      warning: null,
    });
  });

  it("não escolhe uma Ordem quando há mais de um dispositivo", () => {
    const detected = detectManualLegislativeReference("Art. 18. Texto. Art. 19. Outro texto.", "Lei nº 1.593/2026");
    expect(detected.suggestion).toBeNull();
    expect(detected.warning).toContain("mais de um Artigo");
  });

  it("reconhece um artigo completo mesmo com vários parágrafos no corpo", () => {
    const detected = detectManualLegislativeReference(`Art. 5º O porte de armas pelos ocupantes do cargo de Guarda Civil Municipal será autorizado pelos órgãos competentes.

§ 1º Para a utilização de arma por guarda municipal é indispensável a frequência em curso específico.

§ 2º A avaliação psicológica de que trata o parágrafo anterior deverá ser renovada a cada 24 meses.`, "Lei 13.022/2014");

    expect(detected).toEqual({
      suggestion: { identification: "Art. 5º, Lei 13.022/2014", ordem: "0005.0.00.0.00.0" },
      warning: null,
    });
  });

  it("ignora a referência histórica entre parênteses ao identificar o caput", () => {
    expect(detectManualLegislativeReference("Art. 21. Esta Lei entra em vigor na data de sua publicação. (Primitivo art. 20 renumerado pela Lei nº 8.081, de 21/9/1990)", "Lei 7.716/1989")).toEqual({
      suggestion: { identification: "Art. 21, Lei 7.716/1989", ordem: "0021.0.00.0.00.0" },
      warning: null,
    });
  });

  it("aceita somente a Ordem com seis segmentos canônicos", () => {
    expect(isCanonicalManualReferenceOrder("0018.a.01.0.00.0")).toBe(true);
    expect(isCanonicalManualReferenceOrder("18-A, § 1º")).toBe(false);
  });

  it("preserva parágrafos e quebras ao preparar texto colado para armazenamento", () => {
    expect(preserveManualLegislationLineBreaks("Art. 5º Texto.\n\n§ 1º Primeiro.\n\n§ 2º Segundo.")).toBe("<p>Art. 5º Texto.</p>\n<p>§ 1º Primeiro.</p>\n<p>§ 2º Segundo.</p>");
    expect(preserveManualLegislationLineBreaks("Linha 1\nLinha 2")).toBe("<p>Linha 1<br>Linha 2</p>");
  });

  it("não reescreve HTML legal já formatado", () => {
    expect(preserveManualLegislationLineBreaks("<p><strong>Art. 5º</strong> Texto.</p>")).toBe("<p><strong>Art. 5º</strong> Texto.</p>");
  });
});
