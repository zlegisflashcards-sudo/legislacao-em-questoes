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
    expect(client).toContain("Organizei os dispositivos por prioridade estatística");
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
    expect(client).toContain("Prioridade de revisão");
    expect(client).not.toContain("cinza, amarelo (3+), laranja (5+) e vermelho (9+)");
    expect(client).toContain('first.ordem.localeCompare(second.ordem, "pt-BR", { numeric: true })');
    expect(client).not.toContain("PRIORITY_ORDER.indexOf(first.priority) - PRIORITY_ORDER.indexOf(second.priority)");
    expect(client).toContain("function incidenceBand(linkedQuestions: number)");
    expect(client).toContain("lawShortName={title}");
    expect(client).toContain("<small>{lawShortName}</small>");
    expect(client).toContain("function mapArticleLabel");
    expect(client).toContain("canLoadContinuousPage");
    expect(client).toContain("completedContinuousPage");
    expect(client).toContain("reference_ids=${encodeURIComponent(referenceIds.join(\",\"))}");
    expect(client).toContain("const preparedById = useMemo");
    expect(client).toContain('if (linkedQuestions >= 6) return "vermelho"');
    expect(client).toContain('if (linkedQuestions >= 4) return "laranja"');
    expect(client).toContain('if (linkedQuestions >= 2) return "amarelo"');
    expect(client).not.toContain("Calor {PRIORITY_LEVELS[reference.priority]}/4");
    expect(client).not.toContain("reference.linkedQuestions === 1 ? \"questão\" : \"questões\"");
    expect(styles).toContain(".incidence_cinza");
    expect(styles).toContain(".incidence_amarelo");
    expect(styles).toContain(".incidence_laranja");
    expect(styles).toContain(".incidence_vermelho");
    expect(styles).toContain("grid-template-columns: repeat(2, minmax(0, 1fr))");
    expect(client).toContain('className={styles.cardRecentFlag}');
    expect(client).toContain('aria-label="Conteúdo recente"');
    expect(server).toContain("priority: publicPriority(linkedQuestions)");
    expect(server).toContain("formatLegalReferenceFromOrder(reference.ordem, law.nome_curto)");
    expect(server).toContain('select("id,slug,titulo,nome_curto,codigo")');
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

  it("deixa o redirect de aprofundamento fora dos catches de consulta", () => {
    expect(page).toContain("model = await getContinuousReadingModel(slug)");
    expect(page).toContain("if (reference) redirect(");
    expect(page).toContain("// `redirect` lança NEXT_REDIRECT; ele deve permanecer fora do catch de I/O.");
    expect(page.indexOf("if (reference) redirect(")).toBeLessThan(page.indexOf("const initialBlocks = await getContinuousReadingBlocks"));
  });

  it("mantém os destaques salvos no bloco da leitura contínua", () => {
    expect(client).toContain("blockHighlights");
    expect(client).toContain("ContinuousLegalHtml");
    expect(client).toContain("onHighlightsChange={updateBlockHighlights}");
    expect(client).toContain("reference_ids=");
    expect(client).toContain("loadedHighlightReferencesRef");
    expect(client).toContain("controller.abort()");
    expect(client).toContain("personal-highlight ${highlight.color}");
  });

  it("mantém as cores de prioridade no mapa e usa barra neutra na leitura", () => {
    expect(client).not.toContain('styles[`readingPriority_${reference.priority}`]');
    expect(styles).not.toContain(".readingPriority_muito_alta");
    expect(styles).toContain("border-left: 4px solid #475569");
    expect(styles).toContain("border-left-color: #2563eb");
    expect(styles).toContain(".incidence_vermelho");
    expect(client).toContain("focusedId === reference.id || activeId === reference.id");
    expect(styles).toContain("@keyframes scanDocument");
    expect(styles).toContain("prefers-reduced-motion: reduce");
  });

  it("usa a própria leitura contínua como prévia e abre a edição administrativa por bloco", () => {
    expect(client).toContain("adminPreview = false");
    expect(client).toContain("/admin/artigos/${encodeURIComponent(slug.toLowerCase())}/${encodeURIComponent(block.ordem)}?aba=artigo");
    expect(client).toContain("<ReadingStructureHeadings nodes={introducedHierarchy} />");
  });
});
