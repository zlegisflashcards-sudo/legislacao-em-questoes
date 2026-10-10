import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { compareLegislationText, groupLegisBotSourceConflicts, type LegisBotConflictQuestion } from "./legisbot/source-conflicts";
import { sanitizeLegalHtmlCore } from "./legisbot/sanitize-legal-html-core";

const row = (id: string, legislacao: string, overrides: Partial<LegisBotConflictQuestion> = {}): LegisBotConflictQuestion => ({
  id, lei_id: 1, slug: "cp", ordem: "0013.0.00.00", titulo: "Código Penal", assunto: "Art. 13",
  legislacao, pergunta: `Pergunta ${id}`, resposta: "Certo", justificativa: "Fundamento", ativo: true,
  updated_at: "2026-09-29T12:00:00Z", ...overrides,
});

describe("conflitos da fonte do LegisBot", () => {
  it("não mostra duplicidades equivalentes e ignora formatação visual", () => {
    expect(groupLegisBotSourceConflicts([
      row("a", '<p style="color:red"><strong>Texto legal</strong></p>'),
      row("b", "<div>Texto legal</div>"),
    ])).toHaveLength(0);
  });

  it("mostra divergências reais agrupadas por versão normalizada", () => {
    const conflicts = groupLegisBotSourceConflicts([
      row("a", "<p>Texto A</p>"), row("b", "<div><b>Texto A</b></div>"), row("c", "<p>Texto B</p>"),
      row("inactive", "<p>Texto C</p>", { ativo: false }),
    ]);
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0].versions.size).toBe(2);
    expect([...conflicts[0].versions.values()].map((items) => items.length).sort()).toEqual([1, 2]);
    expect(conflicts[0].questions.map((item) => item.id)).not.toContain("inactive");
  });

  it("remove automaticamente a pendência quando as versões são corrigidas", () => {
    const before = [row("a", "<p>Texto A</p>"), row("b", "<p>Texto B</p>")];
    expect(groupLegisBotSourceConflicts(before)).toHaveLength(1);
    const after = before.map((item) => ({ ...item, legislacao: "<div><strong>Texto A</strong></div>" }));
    expect(groupLegisBotSourceConflicts(after)).toHaveLength(0);
  });

  it("destaca somente o trecho textual divergente", () => {
    const parts = compareLegislationText("<p>O agente deve agir com dolo.</p>", "<p>O agente deve agir com culpa.</p>");
    expect(parts.some((part) => part.changed && part.text.includes("dolo"))).toBe(true);
    expect(parts.map((part) => part.text).join("")).toContain("O agente deve agir");
  });

  it("sanitiza a visualização sem perder tabela, lista e quebra", () => {
    const html = sanitizeLegalHtmlCore('<table onclick="x()"><tr><th>Regra</th><td>Valor</td></tr></table><ul><li>Item</li></ul><script>alert(1)</script>');
    expect(html).toContain("<table>");
    expect(html).toContain("<li>Item</li>");
    expect(html).not.toMatch(/onclick|script|alert/i);
  });
});

describe("Central do Artigo — administração de conflitos", () => {
  const server = readFileSync("lib/admin-article-conflicts-server.ts", "utf8");
  const api = readFileSync("app/api/admin/artigos/conflitos/route.ts", "utf8");
  const list = readFileSync("components/admin/article-source-conflicts.tsx", "utf8");
  const detail = readFileSync("components/admin/article-source-conflict-detail.tsx", "utf8");
  const panel = readFileSync("components/admin/question-standardization-panel.tsx", "utf8");
  const questionPage = readFileSync("app/admin/leis/[slug]/questoes/page.tsx", "utf8");
  const conflictPage = readFileSync("app/admin/artigos/conflitos/[slug]/[ordem]/page.tsx", "utf8");

  it("filtra por tipo de conflito no servidor e pagina sem enviar todos os registros ao navegador", () => {
    expect(server).toContain("PAGE_SIZE = 20");
    expect(server).toContain("filtered.slice(start, start + PAGE_SIZE)");
    for (const field of ["filters.law", "filters.type"]) expect(server).toContain(field);
    expect(server).toContain('slug.toLocaleLowerCase("pt-BR") !== law');
    expect(server).toContain('type === "estrutural"');
    expect(server).toContain('type === "possivel_estrutural"');
    expect(server).toContain('type === "legislacao"');
    expect(server).toContain('type === "comentario_sem_analise"');
    expect(list).toContain('name="tipo"');
    expect(list).toContain("Comentário sem análise");
    expect(list).toContain("pagina");
  });

  it("abre o UUID correto no editor existente e retorna ao conflito", () => {
    expect(server).toContain("question_id=${encodeURIComponent(question.id)}");
    expect(server).toContain("retorno=${encodeURIComponent");
    expect(questionPage).toContain("initialQuestion");
    expect(questionPage).toContain('requestedReturn.startsWith("/admin/artigos/")');
    expect(detail).toContain("Corrigir a ordem");
  });

  it("volta à lista filtrada pela lei quando a URL do conflito contém uma ordem inválida", () => {
    expect(conflictPage).toContain("normalizeLegisBotIdentifiers(slug, ordem)");
    expect(conflictPage).toContain("redirect(fallbackHref)");
    expect(conflictPage).toContain("aba=conflitos&lei=");
  });

  it("volta à lista filtrada pela lei quando o conflito da URL já foi resolvido", () => {
    expect(conflictPage).toContain("if (!conflict) redirect(");
    expect(conflictPage).toContain("identifiers.slug.toLowerCase()");
    expect(conflictPage).not.toContain("if (!conflict) notFound()");
  });

  it("padroniza somente legislação com prévia, proteção contra estado antigo e RPC transacional auditada", () => {
    expect(server).toContain('field: "legislacao"');
    expect(server).toContain("question_ids: preview.questionIds");
    expect(server).toContain("JSON.stringify(input.expected) !== JSON.stringify(preview.expected)");
    expect(server).toContain("applyBulkQuestionEdit");
    expect(detail).toContain("Somente o campo");
    expect(detail).toContain("IDs afetados");
  });

  it("permite informar uma legislação nova apenas para os flashcards marcados", () => {
    expect(detail).toContain("Criar legislação correta");
    expect(detail).toContain("legislationOnly");
    expect(detail).toContain("selectedIds");
    expect(panel).toContain("legislationOnly");
    expect(panel).toContain("A legislação será aplicada apenas aos flashcards marcados.");
  });

  it("renderiza pergunta e justificativa com HTML sanitizado, sem expor marcação bruta", () => {
    expect(detail).toContain("sanitizeLegisQuestoesHtml");
    expect(detail).toContain('label="Pergunta" value={question.pergunta} richText');
    expect(detail).toContain('label="Justificativa" value={question.justificativa} richText');
  });

  it("reavalia automaticamente, preserva o comentário e sinaliza revisão sem chamar IA", () => {
    expect(server).toContain("getArticleSourceConflict(preview.slug, preview.ordem)) === null");
    expect(server).toContain("precisa_revisao: true");
    expect(server).not.toMatch(/openai|gerarComentario|requestLegisBotGeneration/i);
    expect(server).not.toMatch(/comentario:\s*null|delete\(\).*legisbot_comentarios/);
  });

  it("calcula pendências diretamente dos flashcards ativos e ignora HTML visual equivalente", () => {
    expect(server).toContain("const activeRows = await loadQuestions(true)");
    expect(server).toContain("groupLegisBotSourceConflicts(activeRows)");
    expect(server).toContain("const filteredContexts = filtered.map");
    expect(server).toContain("pending: filteredContexts.length");
    expect(server).not.toContain("pending: contextKeys.length");
    expect(server).toContain("getArticleSourceConflict(preview.slug, preview.ordem)) === null");
  });

  it("inativa com confirmação, reavalia o conflito e exige administrador no servidor", () => {
    expect(server).toContain('confirmation !== "INATIVAR"');
    expect(server).toContain("deactivateAdminQuestion");
    expect(server.match(/await requireAdmin\(\)/g)?.length).toBeGreaterThanOrEqual(4);
    expect(api).toContain("AdminArticleConflictError");
    expect(api.indexOf("obterAdministrador()")).toBeLessThan(api.indexOf("request.json()"));
    expect(detail).toContain("Ele não será excluído");
  });

  it("oferece lote somente para ordens estruturais inequívocas e exige autorização", () => {
    expect(server).toContain("previewArticleStructuralBatch");
    expect(server).toContain('input.confirmation !== "APLICAR ORDENS"');
    expect(server).toContain("validations.every");
    expect(server).toContain("expectedOrders.size !== 1");
    expect(server).toContain("structuralSuggestions");
    expect(api).toContain('body.action === "aplicar_lote_estrutural"');
    expect(list).toContain("Marcar para lote");
    expect(list).toContain("Sugerir lote");
    expect(list).toContain("Confirmar solução em lote");
  });

  it("permite decidir a granularidade por lote sem alterar os flashcards", () => {
    expect(server).toContain("previewArticleGranularityBatch");
    expect(server).toContain("applyArticleGranularityBatch");
    expect(server).toContain("hasIncisoGranularityPending(row)");
    expect(server).toContain("granularity_decision: decision");
    expect(api).toContain('body.action === "previsualizar_lote_granularidade"');
    expect(api).toContain('body.action === "aplicar_lote_granularidade"');
    expect(list).toContain("Revisar granularidade");
    expect(list).toContain("Decidir granularidade em lote");
    expect(list).toContain("nenhuma pergunta, resposta, legislação ou ordem será alterada");
    expect(list).not.toContain("Digite APLICAR GRANULARIDADE");
  });

  it("exibe explicitamente todos os tipos de revisão de cada contexto", () => {
    expect(server).toContain("const reviewTypes = [");
    expect(server).toContain('"Legislação divergente"');
    expect(server).toContain('"Pendência de granularidade"');
    expect(server).toContain('"Comentário sem análise"');
    expect(list).toContain('aria-label="Tipos de revisão"');
    expect(list).toContain("item.reviewTypes.map");
  });

  it("oferece prévia e confirmação para limpar HTML dos assuntos sem alterar o restante da questão", () => {
    expect(server).toContain("previewArticleReferenceCleanup");
    expect(server).toContain("applyArticleReferenceCleanup");
    expect(server).toContain("normalizeQuestionLegalReference(before)");
    expect(server).toContain('input.confirmation !== "LIMPAR ASSUNTOS"');
    expect(server).toContain('.update({ assunto: candidate.after })');
    expect(api).toContain('body.action === "previsualizar_limpeza_assuntos"');
    expect(api).toContain('body.action === "aplicar_limpeza_assuntos"');
    expect(list).toContain("Limpar HTML dos assuntos");
    expect(list).toContain("Pergunta, justificativa, legislação, respostas e ordem não serão alteradas.");
  });
});
