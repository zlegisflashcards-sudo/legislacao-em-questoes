import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { conflictingImportSourceGroups, groupImportSourceWarnings, normalizedImportSource, validateImportSource } from "./import-source";
import { legalHtmlToStructuredText, sanitizeLegalHtmlCore } from "./sanitize-legal-html-core";
import { createLegisBotSourceSignature, LegisBotSourceError, resolveLegisBotSourceRows } from "./source";

describe("fonte canônica do LegisBot", () => {
  it("preserva HTML estrutural seguro e remove conteúdo perigoso e atributos visuais", () => {
    const safe = sanitizeLegalHtmlCore('<table class="anki"><tr onclick="x()"><th style="color:red">Teoria aplicada</th><td>Equivalência</td></tr></table><script>alert(1)</script><iframe src="x"></iframe>');
    expect(safe).toContain("<table>");
    expect(safe).toContain("<th>Teoria aplicada</th>");
    expect(safe).not.toMatch(/script|iframe|onclick|style=|class=/i);
  });

  it("converte tabela, parágrafos, listas, incisos e alíneas em texto estruturado para o prompt", () => {
    const text = legalHtmlToStructuredText('<table><tr><th>Teoria aplicada</th><td>Equivalência dos antecedentes causais</td></tr></table><p>I - na ativa:</p><ul><li>a) militares de carreira;</li><li>b) incluídos voluntariamente.</li></ul>');
    expect(text).toContain("Teoria aplicada: Equivalência dos antecedentes causais.");
    expect(text).toContain("I - na ativa:");
    expect(text).toContain("- a) militares de carreira;");
    expect(text).toContain("- b) incluídos voluntariamente.");
  });

  it("ignora diferenças puramente visuais na assinatura da fonte", () => {
    const first = normalizedImportSource({ titulo: "Lei", assunto: "Art. 1º", legislacao: '<p style="color:red"><strong>Texto</strong> legal</p>' });
    const second = normalizedImportSource({ titulo: " lei ", assunto: "art. 1º", legislacao: "<div>Texto legal</div>" });
    expect(first).toBe(second);
    expect(createLegisBotSourceSignature({ titulo: "Lei", assunto: "Art. 1º", promptLegislacao: "Texto legal" })).toHaveLength(64);
  });

  it("valida os cinco campos e denuncia conflito de slug + ordem na importação", () => {
    const base = { slug: "cp", ordem: "0013.0.00.00", titulo: "Código Penal", assunto: "Art. 13", legislacao: "<p>Texto A</p>" };
    expect(validateImportSource(base)).toBeNull();
    expect(validateImportSource({ ...base, legislacao: "<script>x()</script>" })).toContain("legislacao");
    expect(conflictingImportSourceGroups([base, { ...base, legislacao: "<p>Texto B</p>" }]).size).toBe(1);
    expect(conflictingImportSourceGroups([base, { ...base, legislacao: "<div><strong>Texto A</strong></div>" }]).size).toBe(0);
    expect(conflictingImportSourceGroups([base, { ...base, assunto: "Artigo primeiro" }]).size).toBe(0);
  });

  it("agrupa divergências como aviso único e não confunde metadados com legislação", () => {
    const base = { slug: "cp", ordem: "0013.0.00.00", titulo: "Código Penal", assunto: "Art. 13", legislacao: "<p>Texto A</p>" };
    const conflicts = groupImportSourceWarnings([base, { ...base, legislacao: "<p>Texto B</p>" }, { ...base, legislacao: "<div><strong>Texto B</strong></div>" }]);
    expect(conflicts).toEqual([expect.objectContaining({ kind: "legislacao", slug: "CP", ordem: base.ordem, flashcards: 3, versions: 2 })]);
    const metadata = groupImportSourceWarnings([base, { ...base, titulo: "CP", assunto: "Artigo 13" }]);
    expect(metadata).toEqual([expect.objectContaining({ kind: "metadados", versions: 2 })]);
  });

  it("bloqueia o LegisBot somente diante de legislação realmente divergente", () => {
    const identifiers = { slug: "CP", ordem: "0013.0.00.00" };
    const row = { id: "a", slug: "cp", ordem: identifiers.ordem, titulo: "Código Penal", assunto: "Art. 13", legislacao: "<p>Texto legal</p>", updated_at: "2026-09-30T00:00:00Z" };
    expect(resolveLegisBotSourceRows([row, { ...row, id: "b", assunto: "Artigo 13", legislacao: "<div><strong>Texto legal</strong></div>" }], identifiers, null).questionId).toBe("a");
    expect(() => resolveLegisBotSourceRows([row, { ...row, id: "b", legislacao: "<p>Texto legal diferente</p>" }], identifiers, null)).toThrow(LegisBotSourceError);
    try {
      resolveLegisBotSourceRows([row, { ...row, id: "b", legislacao: "<p>Texto legal diferente</p>" }], identifiers, null);
    } catch (error) {
      expect(error).toMatchObject({ kind: "conflict", publicMessage: "Este conteúdo está temporariamente indisponível enquanto passa por revisão." });
    }
  });

  it("usa somente slug + ordem no cliente, ignora query legada e gera URL canônica no Anki", () => {
    const page = readFileSync("app/legisbot/[slug]/[ordem]/page.tsx", "utf8");
    const client = readFileSync("app/legisbot/legisbot-page-client.tsx", "utf8");
    const overlay = readFileSync("components/legisbot-overlay.tsx", "utf8");
    const template = readFileSync("public/anki-templates/verso-certo-errado-4.0.txt", "utf8");
    expect(page).not.toMatch(/query\.(titulo|assunto|legislacao)/);
    expect(page).toContain("query.aba");
    expect(client).toContain("body: JSON.stringify({})");
    expect(overlay).toContain('dadosIniciais={{ titulo: "", assunto: "", legislacao: "" }}');
    expect(template).not.toMatch(/encodeURIComponent\((titulo|assunto|legislacao)\)/);
    expect(template).not.toContain("?titulo=");
    expect(template).toContain("aba === 'legisbot' ? hrefBase");
  });

  it("mantém a revelação pedagógica do Legis Questões e respeita redução de movimento", () => {
    const client = readFileSync("app/legisbot/legisbot-page-client.tsx", "utf8");
    expect(client).toContain("👤 Clique aqui para perguntar sobre este artigo");
    expect(client).toContain("LegisBot, pode me explicar este artigo?");
    expect(client).toContain("🤖 LegisBot está digitando...");
    expect(client).toContain('matchMedia("(prefers-reduced-motion: reduce)")');
    expect(client).not.toContain("Você está escrevendo");
  });

  it("preserva comentário anterior e sinaliza revisão por assinatura normalizada", () => {
    const repository = readFileSync("lib/legisbot/generation-repository.ts", "utf8");
    const migration = readFileSync("supabase/migrations/20260929120000_track_legisbot_source_revision.sql", "utf8");
    expect(repository).toContain("storedSignature !== source.signature");
    expect(repository).toContain("precisa_revisao: precisaRevisao");
    expect(repository).not.toContain("comentario: null");
    expect(migration).toContain("source_signature varchar(64)");
    expect(migration).toContain("precisa_revisao boolean not null default false");
  });

  it("faz reimportação idempotente, atualiza fonte alterada e não chama IA", () => {
    const importer = readFileSync("lib/admin-questoes-server.ts", "utf8");
    expect(importer).toContain('sourceChanged ? "atualizada" : "duplicada"');
    expect(importer).toContain("existing_id: matching?.id ?? null");
    expect(importer).toContain('update({ precisa_revisao: true })');
    expect(importer).toContain("groupImportSourceWarnings(effectiveSources)");
    expect(importer).toContain("conflitos: previewData.summary.conflitos");
    expect(importer).not.toContain("const pairConflict");
    expect(importer).not.toMatch(/gerarComentarioLegisBot|openai\.responses|OPENAI_API_KEY/);
  });
});
