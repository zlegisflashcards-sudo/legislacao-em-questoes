import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync("components/student-study-hub.tsx", "utf8");
const lawStudySource = readFileSync("components/law-study-page-client.tsx", "utf8");

describe("central Meus estudos", () => {
  it("troca repetidamente a lei ativa sem criar uma campanha ou UUID novo", () => {
    expect(source).toContain('const keyOf = (law: StudentLaw) => `${law.id}:${law.studyContextId ?? "completa"}`');
    expect(source).toContain('setSelectedKey(key);');
    expect(source).toContain('url.searchParams.set("estudo", key);');
    expect(source).toContain('window.localStorage.setItem(lastStudyKey, key);');
    expect(source).toContain('resolveActiveStudyKey(laws, fromUrl, saved)');
    expect(source).not.toContain("fetch(");
    expect(source).not.toContain("POST");
  });

  it("reutiliza a área real de estudo e sua árvore com o recorte correto", () => {
    expect(source).toContain('recorte_id=${encodeURIComponent(law.studyContextId)}');
    expect(source).toContain('<LawStudyPageClient');
    expect(source).toContain('embedded compact recorteId=');
    expect(source).not.toContain('A lei escolhida abre acima com sua estrutura.');
    expect(source).toContain('<StudentExamClient embedded');
    expect(source).not.toContain('Trocar lei');
    expect(source).not.toContain('function LawSelector');
  });

  it("expõe abas acessíveis, carregamento, erro e histórico Back/Forward", () => {
    expect(source).toContain('role="tablist"');
    expect(source).toContain('aria-selected={tab === "active"}');
    expect(source).toContain('window.addEventListener("popstate", chooseFromUrl)');
    expect(source).toContain('role="status"');
    expect(source).toContain('role="alert"');
    expect(source).toContain('Sala de Records');
  });

  it("mantém o dashboard em um bloco, com orientação vazia e expansão por ícone", () => {
    const compact = lawStudySource.slice(lawStudySource.indexOf("function CompactStudyCard"), lawStudySource.indexOf("function Frame"));
    expect(compact).toContain("Continuar estudando");
    expect(compact).toContain('aria-label="Expandir estudo em página completa"');
    expect(compact).toContain('title="Expandir estudo"');
    expect(compact).toContain('conic-gradient');
    expect(compact).toContain('Você ainda não respondeu questões desta lei.');
    expect(compact).not.toContain("Seu recorde");
    expect(compact).not.toContain("Melhor pontuação");
    expect(compact).not.toContain("Progresso da campanha");
    expect(source).toContain('Selecione uma lei do edital para começar.');
    expect(source).toContain('<StudentExamClient embedded contained');
  });

  it("mantém o indicador Melhor somente no resumo da página completa", () => {
    expect(lawStudySource).toContain('>Melhor</p>');
    expect(lawStudySource).toContain('Melhor pontuação');
    expect(lawStudySource).toContain('Salvo mesmo ao reiniciar o estudo.');
    expect(lawStudySource).toContain('campaign.record ? campaign.record.score.toLocaleString("pt-BR") : "—"');
  });
});
