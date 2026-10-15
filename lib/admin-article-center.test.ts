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

  it("mantém a busca legada de questões e usa a base persistente na aba Artigos", () => {
    expect(server).toContain("slug.ilike");
    expect(server).toContain("codigo.ilike");
    expect(server).toContain("ordem.ilike");
    expect(server).toContain("assunto.ilike");
    expect(index).toContain("listLegislativeReferences({ lawSlug: lawFilter, query");
    expect(index).toContain("orderDirection");
    expect(index).not.toContain("searchArticleContexts(query, lawFilter)");
    expect(index).toContain('name="lei"');
  });

  it("abre a listagem na aba Artigos e só seleciona LegisBot por parâmetro explícito", () => {
    expect(index).toContain('requestedTab === "legisbot" ? "legisbot"');
    expect(index).toContain(': "artigos"');
    expect(index).toContain('tab === "artigos" ? "active" : ""');
    expect(index).toContain('href={tabHref("artigos")}>Artigos');
  });

  it("preserva o slug selecionado entre as abas, inclusive Conflitos", () => {
    expect(index).toContain('lei=${encodeURIComponent(lawFilter)}');
    expect(index).toContain("one(params.lei) || one(params.law)");
    expect(index).toContain("&ordem_sort=${orderDirection}");
    expect(index).toContain("article-context-filter ${styles.contextFilter}");
    expect(index).toContain('name="lei"');
    expect(index).toContain("filters={conflictFilters}");
    const conflicts = read("components/admin/article-source-conflicts.tsx");
    expect(conflicts).toContain('type="hidden" name="lei"');
    expect(conflicts).toContain('type="hidden" name="ordem_sort"');
    expect(conflicts).toContain('key === "law" ? "lei" : key === "type" ? "tipo" : key');
    expect(conflicts).toContain("Sugerir lote{filters.law");
  });

  it("carrega conflitos apenas na aba correspondente", () => {
    expect(index).toContain('tab === "conflitos" ? await listArticleSourceConflicts');
    expect(index).toContain("conflicts ? <span>{conflicts.indicators.pending}</span>");
    expect(index).not.toContain("const pendingSummary");
  });

  it("compacta o seletor de contexto e mantém as abas roláveis no celular", () => {
    const styles = read("components/admin/article-context-filter.module.css");
    expect(index).toContain('from "@/components/admin/article-context-filter.module.css"');
    expect(index).toContain("article-tabs ${styles.tabs}");
    expect(styles).toContain("flex: 0 0 auto");
    expect(styles).toContain("-webkit-overflow-scrolling: touch");
    expect(styles).toContain("scroll-padding-inline: 12px");
  });

  it("ordena a Central pelo campo ordem, sem critério temporal", () => {
    const references = read("lib/admin-legislative-references.ts");
    const mappings = read("lib/admin-article-mappings.ts");
    const conflicts = read("lib/admin-article-conflicts-server.ts");
    expect(index).toContain("Ordenar pelo campo ordem");
    expect(index).not.toContain('value="recent"');
    expect(index).toContain('.order("ordem", { ascending: orderDirection === "asc" })');
    expect(references).toContain('.order("ordem", { ascending: input.orderDirection !== "desc" })');
    expect(mappings).toContain('orderDirection === "desc" ? right.ordem.localeCompare(left.ordem)');
    expect(conflicts).toContain('filters.orderDirection === "desc" ? -compared : compared');
  });

  it("centraliza as operações administrativas de LegisBot e comunidade nas abas", () => {
    expect(index).toContain("ArticleLegisBotPanel");
    expect(index).toContain("ArticleCommunityPanel");
    expect(index).toContain("alterarStatusComentario");
    expect(index).toContain("moderateCommunityComment");
    expect(index).toContain('name="ordem_sort"');
    expect(index).not.toContain('value="recent"');
    expect(index).toContain("Comentado em {formatCommentDate(item.created_at)}");
  });

  it("mantém resultados ambíguos como uma lista para escolha", () => {
    expect(index).toContain("article-result-list");
    expect(index).toContain("/admin/artigos/${encodeURIComponent(item.slug.toLowerCase())}/${encodeURIComponent(item.ordem)}");
  });

  it("volta para a lista da lei quando o artigo da URL não existe mais", () => {
    expect(detail).toContain('import { redirect } from "next/navigation"');
    expect(detail).toContain("if (!article) redirect(");
    expect(detail).toContain('lei=${encodeURIComponent(slug.trim().toLowerCase())}');
    expect(detail).not.toContain("if (!article) notFound()");
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
    const panel = read("components/admin/article-legisbot-panel.tsx");
    expect(panel).toContain("base legislativa preparada deste dispositivo");
    expect(panel).toContain("independente dos conflitos das questões");
  });

  it("reutiliza a ação de moderação e as ações editoriais existentes", () => {
    expect(community).toContain("moderateCommunityComment");
    const panel = read("components/admin/article-legisbot-panel.tsx");
    expect(panel).toContain("LegisBotEditor");
    expect(panel).toContain("returnHref");
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

  it("prepara o LegisBot a partir da base preparada e preserva a publicação humana", () => {
    const actions = read("app/admin/actions.ts");
    const source = read("lib/legisbot/source.ts");
    const editor = read("components/admin/legisbot-editor.tsx");
    const panel = read("components/admin/article-legisbot-panel.tsx");
    expect(panel).toContain("prepararContextoLegisBot");
    expect(panel).toContain("Gerar com API");
    expect(panel).toContain("Legislação preparada necessária");
    expect(actions).toContain('status: "pendente"');
    expect(actions).toContain("findLegisBotSource");
    expect(actions).toContain('intent === "publish" ? "concluido"');
    expect(editor).toContain('name="intent" value="publish"');
    expect(source).toContain('from("legislative_references")');
    expect(source).toContain("Nunca consulta questions");
  });

  it("trata divergência entre Assunto e Ordem como conflito estrutural do contexto", () => {
    expect(server).toContain("validateQuestionStructure({ ...item");
    expect(server).toContain("structuralValidation");
    expect(server).toContain("Boolean(structuralValidation)");
    expect(detail).toContain("Conflito estrutural");
    expect(detail).toContain("Ordem esperada");
  });

  it("permite decidir a granularidade de contextos por inciso sem alterar questões automaticamente", () => {
    const standardization = read("lib/admin-article-context-standardization.ts");
    const panel = read("components/admin/question-standardization-panel.tsx");
    const migration = read("supabase/migrations/20261007130000_add_article_context_granularity_decision.sql");
    expect(detail).toContain("granularityPending={article.editorialGranularityPending}");
    expect(detail).toContain("Possível erro editorial");
    expect(detail).toContain("Analisar possível erro");
    expect(panel).toContain("Manter como está");
    expect(panel).toContain("Alterar o recorte da legislação");
    expect(panel).toContain("possível inconsistência é de granularidade");
    expect(panel).toContain("granularity_decision");
    expect(standardization).toContain("Object.keys(questionPatch).length");
    expect(standardization).toContain("granularidade_legislacao");
    expect(server).toContain("granularidade_legislacao");
    expect(migration).toContain("granularidade_legislacao");
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
    expect(listing).toContain("LawSearchFormSelect");
    expect(read("components/law-search-select.tsx")).toContain("export function LawSearchFormSelect");
    expect(listing).toContain('request = request.eq("slug", law.toUpperCase())');
    expect(listing).toContain("retorno=");
    expect(detail).toContain("returnHref");
  });
});
