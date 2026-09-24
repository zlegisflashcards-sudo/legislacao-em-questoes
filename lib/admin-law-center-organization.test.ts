import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf8");
const scopes = read("components/admin/admin-question-scopes.tsx");
const anki = read("components/admin/admin-question-anki-tools.tsx");

describe("organização de Recortes e Anki na Central da Lei", () => {
  it("cria as duas rotas contextuais sem seletor de lei", () => {
    const scopesPage = "app/admin/leis/[slug]/recortes/page.tsx";
    const ankiPage = "app/admin/leis/[slug]/anki/page.tsx";
    expect(existsSync(scopesPage)).toBe(true);
    expect(existsSync(ankiPage)).toBe(true);
    expect(read(scopesPage)).toContain("<LawScopesPanel lawSlug={law.slug}");
    expect(read(ankiPage)).toContain("<AdminQuestionAnkiTools lawSlug={law.slug}");
    expect(read(scopesPage)).not.toContain("LawSearchSelect");
    expect(read(ankiPage)).not.toContain("LawSearchSelect");
  });

  it("concentra Recortes e Anki na Central usando os componentes compartilhados", () => {
    expect(existsSync("components/admin/admin-question-scopes.tsx")).toBe(true);
    expect(existsSync("components/admin/admin-question-anki-tools.tsx")).toBe(true);
  });

  it("preserva o fluxo e as regras existentes de Recortes", () => {
    expect(scopes).toContain("buildScopeTree(nodes)");
    expect(scopes).toContain("descendantsForScope(nodes, selected)");
    expect(scopes).toContain("normalizeScopeSelection(nodes, selected)");
    expect(scopes).toContain("unstructured_questions");
    expect(scopes).toContain('action: "salvar_recorte"');
    expect(scopes).toContain("id: editing?.id");
    expect(scopes).toContain("ativo: active");
  });

  it("preserva os fluxos TXT, APKG e o exportador administrativo", () => {
    for (const action of ["previsualizar_anki", "importar_anki", "previsualizar_apkg", "importar_apkg"]) expect(anki).toContain(action);
    expect(anki).toContain('accept=".txt,text/plain"');
    expect(anki).toContain('accept=".apkg,application/octet-stream"');
    expect(anki).toContain("/api/admin/questoes/exportar-apkg?slug=");
    expect(anki).toContain("await onImported?.()");
  });

  it("aplica sempre o slug da lei contextual nas operações", () => {
    expect(scopes).toContain("law_slug: lawSlug");
    expect(scopes).toContain("encodeURIComponent(lawSlug)");
    expect(anki).toContain("law_slug: lawSlug");
    expect(anki).toContain("encodeURIComponent(lawSlug)");
  });

  it("atualiza navegação e atalhos da visão geral", () => {
    const layout = read("app/admin/leis/[slug]/layout.tsx");
    const overview = read("app/admin/leis/[slug]/page.tsx");
    expect(layout).toContain('href={`${base}/recortes`}');
    expect(layout).toContain('href={`${base}/anki`}');
    expect(overview).toContain('href={`${base}/recortes`}');
    expect(overview).toContain('href={`${base}/anki`}');
  });
});
