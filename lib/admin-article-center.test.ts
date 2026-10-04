import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf8");
const server = read("lib/admin-article-center-server.ts");
const index = read("app/admin/artigos/page.tsx");
const detail = read("app/admin/artigos/[slug]/[ordem]/page.tsx");
const community = read("components/admin/article-community-comments.tsx");

describe("Central do Artigo administrativa", () => {
  it("exige administrador nas consultas server-side", () => {
    expect(server.match(/await exigirAdministrador\(\)/g)?.length).toBeGreaterThanOrEqual(4);
    expect(detail).toContain("await exigirAdministrador()");
  });

  it("pesquisa slug, código, ordem e artigo sem carregar dados no cliente", () => {
    expect(server).toContain("slug.ilike");
    expect(server).toContain("codigo.ilike");
    expect(server).toContain("ordem.ilike");
    expect(server).toContain("assunto.ilike");
    expect(index).toContain("searchArticleContexts(query, lawFilter)");
    expect(index).toContain('name="lei"');
  });

  it("abre a listagem na aba Artigos e só seleciona LegisBot por parâmetro explícito", () => {
    expect(index).toContain('requestedTab === "legisbot" ? "legisbot" : "artigos"');
    expect(index).toContain('tab === "artigos" ? "active" : ""');
    expect(index).toContain('href={tabHref("artigos")}>Artigos');
  });

  it("preserva o slug selecionado entre as abas, inclusive Conflitos", () => {
    expect(index).toContain('lei=${encodeURIComponent(lawFilter)}');
    expect(index).toContain("&ordem_sort=${orderDirection}");
    expect(index).toContain('className="article-context-filter"');
    expect(index).toContain('name="lei"');
    expect(index).toContain("filters={conflictFilters}");
    const conflicts = read("components/admin/article-source-conflicts.tsx");
    expect(conflicts).toContain('type="hidden" name="lei"');
    expect(conflicts).toContain('type="hidden" name="ordem_sort"');
    expect(conflicts).toContain("Sugerir lote{filters.law");
  });

  it("centraliza as operações administrativas de LegisBot e comunidade nas abas", () => {
    expect(index).toContain("ArticleLegisBotPanel");
    expect(index).toContain("ArticleCommunityPanel");
    expect(index).toContain("alterarStatusComentario");
    expect(index).toContain("moderateCommunityComment");
    expect(index).toContain('value="recent">Mais recentes');
    expect(index).toContain("Comentado em {formatCommentDate(item.created_at)}");
  });

  it("mantém resultados ambíguos como uma lista para escolha", () => {
    expect(index).toContain("article-result-list");
    expect(index).toContain("/admin/artigos/${encodeURIComponent(item.slug.toLowerCase())}/${encodeURIComponent(item.ordem)}");
  });

  it("mantém a aba de comentários no contexto derivado de questões", () => {
    expect(index).toContain('tabHref("comentarios")');
    expect(detail).toContain('tab === "comentarios"');
    expect(community).toContain("highlightedId === item.id");
  });

  it("usa questões como fonte primária e agrega camadas auxiliares", () => {
    expect(server).toContain('from("questions")');
    expect(server).toContain('eq("ativo", true)');
    expect(server).toContain('db.from("legisbot_comentarios").select("*")');
    expect(server).toContain('db.from("legisbot_comentarios_comunidade")');
    expect(server).toContain("listTrustedQuestionArticleContexts");
    expect(server).toContain("normalizedLegisBotLegislation");
    expect(server).toContain("normalizedLegisBotSourceText");
  });

  it("preserva contextos com apenas questões, LegisBot ou comentário como agregados", () => {
    expect(server).toContain("questionsCount: group.length");
    expect(server).toContain("legisbot: bot");
    expect(server).toContain("commentsCount:");
    expect(detail).toContain("O LegisBot é uma camada editorial do dispositivo derivado das questões.");
  });

  it("reutiliza a ação de moderação e as ações editoriais existentes", () => {
    expect(community).toContain("moderateCommunityComment");
    expect(detail).toContain("LegisBotEditor");
    expect(detail).toContain("returnHref");
  });

  it("mantém o editor completo do LegisBot no contexto do artigo", () => {
    const editor = read("components/admin/legisbot-editor.tsx");
    const actions = read("app/admin/actions.ts");
    expect(editor).toContain("excluirComentario");
    expect(editor).toContain("salvarComentario");
    expect(editor).toContain("returnHref");
    expect(editor).toContain("Duplicar");
    expect(actions).toContain("articleUrl");
  });

  it("prepara apenas contextos confiáveis como rascunho e preserva a publicação humana", () => {
    const actions = read("app/admin/actions.ts");
    const source = read("lib/legisbot/source.ts");
    const editor = read("components/admin/legisbot-editor.tsx");
    expect(detail).toContain("prepararContextoLegisBot");
    expect(detail).toContain("Preparar rascunho do LegisBot");
    expect(actions).toContain('status: "pendente"');
    expect(actions).toContain("findLegisBotSource");
    expect(actions).toContain('intent === "publish" ? "concluido"');
    expect(editor).toContain('name="intent" value="publish"');
    expect(source).toContain("subjectVersions.size > 1");
  });

  it("trata divergência entre Assunto e Ordem como conflito estrutural do contexto", () => {
    expect(server).toContain("validateQuestionStructure(item)");
    expect(server).toContain("structuralValidation");
    expect(server).toContain("Boolean(structuralValidation)");
    expect(detail).toContain("Conflito estrutural");
    expect(detail).toContain("Ordem esperada");
  });

  it("filtra comentários pelo par slug + ordem", () => {
    expect(server).toContain('.eq("slug", slug.toUpperCase()).eq("ordem", ordem)');
    expect(server).toContain("filters.reported");
    expect(detail).toContain('name="usuario"');
    expect(detail).toContain('name="status"');
  });

  it("navega entre dispositivos irmãos derivados somente das questões", () => {
    expect(server).toContain("getArticleSiblingContexts");
    expect(server).toContain('.from("questions").select("id,ordem,assunto")');
    expect(server).toContain("articleOrderStructure(item.ordem, item.assunto)");
    expect(detail).toContain("Outros dispositivos deste artigo");
    expect(detail).toContain("siblingHref(sibling.ordem)");
    expect(detail).toContain('key !== "aba"');
  });

  it("mostra a localização pelo vínculo estrutural, sem derivá-la da ordem", () => {
    expect(server).toContain("getArticleStructureTrail");
    expect(server).toContain('from("law_structure")');
    expect(server).toContain("questionStructurePath");
    expect(server).toContain("structureIds.length !== 1");
    expect(detail).toContain("Localização no sumário");
    expect(detail).toContain("Inconsistência de estrutura");
    expect(detail).not.toContain("Bloco:");
    expect(detail).not.toContain("Subbloco:");
  });
});

describe("filtro do painel legado do LegisBot", () => {
  it("filtra por lei e preserva a seleção ao abrir o editor", () => {
    const listing = read("app/admin/legisbot/page.tsx");
    const detail = read("app/admin/legisbot/[id]/page.tsx");
    expect(listing).toContain('name="lei"');
    expect(listing).toContain('request = request.eq("slug", law.toUpperCase())');
    expect(listing).toContain("retorno=");
    expect(detail).toContain("returnHref");
  });
});
