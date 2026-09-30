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
    expect(index).toContain("searchArticleContexts(query)");
    expect(index).toContain('href="/admin/legisbot/novo"');
  });

  it("mantém resultados ambíguos como uma lista para escolha", () => {
    expect(index).toContain("article-result-list");
    expect(index).toContain("/admin/artigos/${encodeURIComponent(item.slug.toLowerCase())}/${encodeURIComponent(item.ordem)}");
  });

  it("abre a aba de comentários e destaca a interação pela URL", () => {
    expect(index).toContain("?aba=comentarios&comentario=");
    expect(detail).toContain('tab === "comentarios"');
    expect(community).toContain("highlightedId === item.id");
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

  it("filtra comentários pelo par slug + ordem", () => {
    expect(server).toContain('.eq("slug", slug.toUpperCase()).eq("ordem", ordem)');
    expect(server).toContain("filters.reported");
    expect(detail).toContain('name="usuario"');
    expect(detail).toContain('name="status"');
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
