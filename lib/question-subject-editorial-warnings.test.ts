import { describe, expect, it } from "vitest";
import { findQuestionSubjectEditorialWarnings } from "./question-subject-editorial-warnings";

describe("avisos editoriais do Assunto", () => {
  it("identifica o vazamento confirmado de Fonte e URL", () => {
    const warnings = findQuestionSubjectEditorialWarnings("Art. 132, Lei nº 1.625/2026, São Gonçalo/RJ. Fonte: https://do.pmsg.rj.gov.br/diario/2026_05_28.pdf");
    expect(warnings).toEqual([expect.objectContaining({ field: "assunto", reason: "URL e marcador Fonte: no Assunto", snippet: expect.stringContaining("https://do.pmsg.rj.gov.br") })]);
  });

  it("identifica cada marcador objetivo isoladamente", () => {
    expect(findQuestionSubjectEditorialWarnings("Art. 1º https://exemplo.test/fonte")[0]?.reason).toBe("URL no Assunto");
    expect(findQuestionSubjectEditorialWarnings("Art. 1º. Fonte: Diário Oficial")[0]?.reason).toBe('Marcador "Fonte:" no Assunto');
  });

  it("não confunde referências legais ou tratados válidos", () => {
    expect(findQuestionSubjectEditorialWarnings("Art. 132, Lei nº 1.625/2026, São Gonçalo/RJ.")).toEqual([]);
    expect(findQuestionSubjectEditorialWarnings("Convenção Americana sobre Direitos Humanos")).toEqual([]);
  });

  it("só analisa Assunto e não altera o conteúdo recebido pelo importador", () => {
    const importedSubject = "Art. 1º";
    const legislationWithSource = "<p>Fonte: https://diario.example/oficial.pdf</p>";
    expect(findQuestionSubjectEditorialWarnings(importedSubject)).toEqual([]);
    expect(legislationWithSource).toContain("Fonte:");
  });
});
