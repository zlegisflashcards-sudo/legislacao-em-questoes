import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync("components/student-study-hub.tsx", "utf8");

describe("central Meus estudos", () => {
  it("carrega o estudo acima somente após o aluno escolher uma lei do edital", () => {
    expect(source).toContain('<ActiveStudy law={selected} recorteId={selectedScopeId} requester={studyRequester} />');
    expect(source).toContain('setSelectedScopeId(examLaw.recorteId);');
    expect(source).toContain('onStudyLawSelect={selectExamLaw}');
    expect(source).toContain('function ActiveStudy');
    expect(source).toContain('if (!law) return null;');
    expect(source).toContain('<LawStudyPageClient');
    expect(source).toContain('window.localStorage.setItem(lastStudyKey, key);');
  });

  it("preserva o recorte ao abrir uma lei da biblioteca", () => {
    expect(source).toContain('recorte_id=${encodeURIComponent(law.studyContextId)}');
    expect(source).toContain('/estudar/lei/${encodeURIComponent(law.slug)}?contexto=completo');
  });

  it("mantém o recorte escolhido no estudo embutido e deixa a expansão abrir a lei completa", () => {
    expect(source).toContain('recorteId={recorteId}');
  });

  it("expõe abas acessíveis, carregamento e erro", () => {
    expect(source).toContain('role="tablist"');
    expect(source).toContain('aria-selected={tab === "active"}');
    expect(source).toContain('role="status"');
    expect(source).toContain('role="alert"');
    expect(source).toContain('Sala de Records');
    expect(source).toContain('Organize seu estudo da lei seca no seu edital personalizado');
  });

});
