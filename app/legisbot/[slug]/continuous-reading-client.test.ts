import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const client = readFileSync("app/legisbot/[slug]/continuous-reading-client.tsx", "utf8");
const styles = readFileSync("app/legisbot/[slug]/continuous-reading.module.css", "utf8");

describe("leitura contínua pública", () => {
  it("remove diagnósticos técnicos e mostra somente a orientação ao aluno", () => {
    expect(client).toContain("Interaja com a legislação");
    expect(client).toContain("grifar, adicionar comentários ou solicitar uma explicação ao LegisBot");
    expect(client).not.toContain("% das questões vinculadas");
    expect(client).not.toContain("Completude não verificada");
    expect(client).not.toContain("Legislação em construção");
  });

  it("mostra somente a estrutura no sumário e acompanha a seção ativa", () => {
    expect(client).not.toContain('key: `reference:${reference.id}`');
    expect(client).not.toContain("reference.identificacao, reference");
    expect(client).toContain("for (const node of reference.hierarchy)");
    expect(client).toContain("aria-current");
    expect(client).toContain("IntersectionObserver");
    expect(client).toContain("setMobileTocOpen(false)");
  });

  it("insere títulos e capítulos no fluxo da lei sem repeti-los em cada dispositivo", () => {
    expect(client).toContain("function hierarchyIntroducedBy");
    expect(client).toContain("<ReadingStructureHeadings nodes={introducedHierarchy}");
    expect(client).toContain('aria-label="Estrutura da legislação"');
    expect(client).toContain("reference.hierarchy.slice(sharedDepth)");
  });

  it("mantém sumário recolhível, sticky no celular e margem segura para âncoras", () => {
    expect(client).toContain("desktopTocOpen");
    expect(client).toContain("mobileTocOpen");
    expect(client).toContain("☰ <span>Sumário</span>");
    expect(client).toContain("📖 Clique na Lei");
    expect(client).toContain("styles.mobileTocCurrent");
    expect(client).toContain("prepared.find((item) => item.id === activeId)?.identificacao");
    expect(styles).toContain("position: sticky");
    expect(styles).toContain("transform: translateX(-50%)");
    expect(styles).toContain("scroll-margin-top");
    expect(styles).toContain("env(safe-area-inset-bottom)");
  });

  it("não redireciona silenciosamente quando a âncora não existe", () => {
    expect(client).toContain("setMissingTarget(true)");
    expect(client).toContain("Este dispositivo não está disponível nesta versão da legislação");
  });

  it("mantém os destaques salvos no bloco da leitura contínua", () => {
    expect(client).toContain("blockHighlights");
    expect(client).toContain("ContinuousLegalHtml");
    expect(client).toContain("onHighlightsChange={updateBlockHighlights}");
    expect(client).toContain("personal-highlight ${highlight.color}");
  });

  it("usa a própria leitura contínua como prévia e abre a edição administrativa por bloco", () => {
    expect(client).toContain("adminPreview = false");
    expect(client).toContain("/admin/artigos/${encodeURIComponent(slug.toLowerCase())}/${encodeURIComponent(block.ordem)}?aba=artigo");
    expect(client).toContain("<ReadingStructureHeadings nodes={introducedHierarchy} />");
  });
});
