import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const client = readFileSync("app/legisbot/[slug]/continuous-reading-client.tsx", "utf8");
const styles = readFileSync("app/legisbot/[slug]/continuous-reading.module.css", "utf8");
const page = readFileSync("app/legisbot/[slug]/page.tsx", "utf8");
const server = readFileSync("lib/legisbot/continuous-reading-server.ts", "utf8");

describe("leitura contínua pública", () => {
  it("apresenta a Lei Interativa como ambiente conduzido pelo LegisBot", () => {
    expect(client).toContain("Lei Interativa");
    expect(client).toContain("LegisBotGuide");
    expect(client).toContain("Eu organizei os dispositivos pela quantidade de questões");
    expect(client).toContain("Vamos percorrer a lei inteira");
    expect(client).toContain("Mapa de prioridade");
    expect(client).toContain("Estudo por prioridade");
    expect(client).toContain("<strong>Leitura</strong>");
    expect(client).toContain("Estude toda a lei");
    expect(client).toContain("FlameIcon");
    expect(client).toContain("ScannerIcon");
    expect(client).toContain("reference.linkedQuestions > 0");
    expect(client).toContain('reference.priority !== "nao_mapeado"');
    expect(client).not.toContain('reference.hierarchy.at(-1)?.name');
    expect(client).toContain("Calor: quantidade de questões vinculadas");
    expect(client).toContain("Calor {PRIORITY_LEVELS[reference.priority]}/4");
    expect(client).toContain("reference.linkedQuestions === 1 ? \"questão\" : \"questões\"");
    expect(client).toContain('className={styles.cardRecentFlag}');
    expect(client).toContain('aria-label="Conteúdo recente"');
    expect(server).toContain("priority: publicPriority(linkedQuestions)");
    expect(server).toContain('select("slug,ordem,artigo_recente")');
    expect(server).not.toContain("mapping?.incidencia");
    expect(page).toContain('title: "Lei Interativa | LegisFlashcards"');
  });

  it("abre links por âncora na leitura ativa sem abrir automaticamente o aprofundamento", () => {
    expect(client).toContain('setStudyMode("leitura")');
    expect(client).toContain("referenceIdFromHash(window.location.hash)");
    expect(client).toContain("window.history.replaceState");
    expect(client).toContain("window.location.pathname}${window.location.search}");
    expect(client).toContain("openFromArticle(block, event.currentTarget)");
    expect(client).not.toContain("setSelected(block);\n    navigate(reference)");
  });

  it("remove diagnósticos técnicos e orienta o aluno pela voz do LegisBot", () => {
    expect(client).toContain("Toque em qualquer dispositivo para grifar, comentar ou pedir minha explicação");
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
    expect(client).toContain("Procurando um artigo? Escolha aqui e eu te levo até ele.");
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

  it("concentra o calor da leitura na barra lateral do dispositivo", () => {
    expect(client).toContain('styles[`readingPriority_${reference.priority}`]');
    expect(styles).toContain(".readingPriority_muito_alta");
    expect(styles).toContain(".readingPriority_nao_mapeado");
    expect(styles).toContain("@keyframes scanDocument");
    expect(styles).toContain("prefers-reduced-motion: reduce");
  });

  it("usa a própria leitura contínua como prévia e abre a edição administrativa por bloco", () => {
    expect(client).toContain("adminPreview = false");
    expect(client).toContain("/admin/artigos/${encodeURIComponent(slug.toLowerCase())}/${encodeURIComponent(block.ordem)}?aba=artigo");
    expect(client).toContain("<ReadingStructureHeadings nodes={introducedHierarchy} />");
  });
});
