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
  const questionPage = readFileSync("app/admin/leis/[slug]/questoes/page.tsx", "utf8");

  it("aplica filtros no servidor e pagina sem enviar todos os registros ao navegador", () => {
    expect(server).toContain("PAGE_SIZE = 20");
    expect(server).toContain("filtered.slice(start, start + PAGE_SIZE)");
    for (const field of ["filters.law", "filters.ordem", "filters.titulo", "filters.assunto", "filters.status", "filters.q"]) expect(server).toContain(field);
    expect(list).toContain("pagina");
  });

  it("abre o UUID correto no editor existente e retorna ao conflito", () => {
    expect(server).toContain("question_id=${encodeURIComponent(question.id)}");
    expect(server).toContain("retorno=${encodeURIComponent");
    expect(questionPage).toContain("initialQuestion");
    expect(questionPage).toContain('requestedReturn.startsWith("/admin/artigos/conflitos/")');
    expect(detail).toContain("Corrigir a ordem");
  });

  it("padroniza somente legislação com prévia, proteção contra estado antigo e RPC transacional auditada", () => {
    expect(server).toContain('field: "legislacao"');
    expect(server).toContain("question_ids: preview.questionIds");
    expect(server).toContain("JSON.stringify(input.expected) !== JSON.stringify(preview.expected)");
    expect(server).toContain("applyBulkQuestionEdit");
    expect(detail).toContain("Somente o campo");
    expect(detail).toContain("IDs afetados");
  });

  it("reavalia automaticamente, preserva o comentário e sinaliza revisão sem chamar IA", () => {
    expect(server).toContain("getArticleSourceConflict(preview.slug, preview.ordem)) === null");
    expect(server).toContain("precisa_revisao: true");
    expect(server).not.toMatch(/openai|gerarComentario|requestLegisBotGeneration/i);
    expect(server).not.toMatch(/comentario:\s*null|delete\(\).*legisbot_comentarios/);
  });

  it("inativa com confirmação, reavalia o conflito e exige administrador no servidor", () => {
    expect(server).toContain('confirmation !== "INATIVAR"');
    expect(server).toContain("deactivateAdminQuestion");
    expect(server.match(/await requireAdmin\(\)/g)?.length).toBeGreaterThanOrEqual(4);
    expect(api).toContain("AdminArticleConflictError");
    expect(api.indexOf("obterAdministrador()")).toBeLessThan(api.indexOf("request.json()"));
    expect(detail).toContain("Ele não será excluído");
  });
});
