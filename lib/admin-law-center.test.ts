import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";

const read = (path: string) => readFileSync(path, "utf8");

describe("Central administrativa por lei", () => {
  it("cria listagem pesquisável e shell contextual protegido", () => {
    for (const path of ["app/admin/leis/page.tsx", "app/admin/leis/[slug]/layout.tsx", "app/admin/leis/[slug]/page.tsx", "app/admin/leis/[slug]/dados/page.tsx", "app/admin/leis/[slug]/estrutura/page.tsx"]) expect(existsSync(path)).toBe(true);
    const list = read("app/admin/leis/page.tsx");
    const shell = read("app/admin/leis/[slug]/layout.tsx");
    expect(list).toContain("listAdminLawCenterLaws(query)");
    expect(list).toContain("Abrir central");
    expect(shell).toContain("await exigirAdministrador()");
    expect(shell).toContain("Central da Lei");
    expect(shell).toContain("Visão geral");
    expect(shell).toContain("Dados da lei");
    expect(shell).toContain("Estrutura");
    expect(shell).toContain('href={`${base}/recortes`}');
    expect(shell).toContain('href={`${base}/anki`}');
  });

  it("usa somente métricas reais das tabelas existentes", () => {
    const server = read("lib/admin-law-center-server.ts");
    for (const table of ["law_structure", "questions", "recortes_leis", "legiscast_audios", "materiais_leis"]) expect(server).toContain(`from("${table}")`);
    expect(server).toContain('select("id", { count: "exact", head: true })');
    expect(read("app/admin/leis/[slug]/page.tsx")).toContain("getAdminLawOverview");
  });

  it("apresenta navegação contextual responsiva e cards operacionais com dados reais", () => {
    const shell = read("app/admin/leis/[slug]/layout.tsx");
    const overview = read("app/admin/leis/[slug]/page.tsx");
    const styles = read("app/globals.css");
    for (const area of ["overview", "dados", "estrutura", "recortes", "legiscast", "questoes", "anki", "materiais"]) {
      expect(shell).toContain(`data-law-nav="${area}"`);
      expect(styles).toContain(`[data-law-area=\"${area}\"]`);
    }
    expect(shell).toContain("law-center-nav-mobile");
    expect(shell).toContain("Trocar lei");
    expect(overview).toContain("overview.structure");
    expect(overview).toContain("law-center-operation-card");
    expect(overview).not.toContain("Math.random");
  });

  it("oferece próximos passos nos vazios sem criar fluxos paralelos", () => {
    expect(read("components/admin/law-structure-admin.tsx")).toContain("Criar primeiro Título");
    expect(read("components/admin/admin-question-scopes.tsx")).toContain("Criar primeiro recorte");
    expect(read("components/admin/admin-law-questions.tsx")).toContain("Abrir Anki");
    expect(read("components/admin/admin-materials.tsx")).toContain("primeiro material já vinculado a esta lei");
    expect(read("components/admin/legiscast-audios-admin.tsx")).toContain("primeiro áudio da lei");
  });

  it("reutiliza os mesmos campos e a mesma API comercial no painel antigo e no novo", () => {
    const oldPanel = read("components/admin/commercial-admin.tsx");
    const newPanel = read("components/admin/law-data-admin.tsx");
    const fields = read("components/admin/law-data-fields.tsx");
    expect(oldPanel).toContain("<LawDataFields law={editing} />");
    expect(newPanel).toContain("<LawDataFields law={law} showFreeAccess={Boolean(law)} />");
    expect(newPanel).toContain('fetch("/api/admin/comercial/leis"');
    for (const name of ["slug", "titulo", "nome_curto", "codigo", "categoria", "thumbnail_url", "descricao", "ordem", "ativo", "acesso_gratuito", "norma_originaria_referencia", "norma_originaria_data", "houve_alteracao_legislativa", "ultima_alteracao_referencia", "ultima_alteracao_data", "situacao_atualizacao"]) expect(fields).toContain(`name="${name}"`);
  });

  it("permite configurar acesso gratuito somente na edição contextual da lei e pelo contrato administrativo", () => {
    const fields = read("components/admin/law-data-fields.tsx");
    const form = read("components/admin/law-data-admin.tsx");
    const server = read("lib/commercial-admin-server.ts");
    const freeMigration = read("supabase/migrations/20260921090000_add_free_law_access.sql");
    expect(fields).toContain("showFreeAccess");
    expect(fields).toContain("Acesso gratuito");
    expect(fields).toContain("Permite que qualquer aluno autenticado acesse esta lei sem liberação comercial.");
    expect(form).toContain("showFreeAccess={Boolean(law)}");
    expect(form).toContain('...(law ? { acesso_gratuito: raw.acesso_gratuito === "true" } : {})');
    expect(server).toContain('"acesso_gratuito"');
    expect(server).toContain('if (update && "acesso_gratuito" in data) result.acesso_gratuito = booleanValue(data.acesso_gratuito, "Acesso gratuito")');
    expect(freeMigration).toContain("create or replace function public.admin_atualizar_lei");
    expect(freeMigration).toContain("acesso_gratuito=case when p_dados?'acesso_gratuito'");
    expect(freeMigration).toContain("admin_comercial_validar_contexto");
  });

  it("cadastra uma lei pela Central e redireciona para a nova Visão Geral", () => {
    const list = read("app/admin/leis/page.tsx");
    const creation = read("app/admin/leis/nova/page.tsx");
    const form = read("components/admin/law-data-admin.tsx");
    expect(existsSync("app/admin/leis/nova/page.tsx")).toBe(true);
    expect(list).toContain('href="/admin/leis/nova"');
    expect(creation).toContain("<LawDataAdmin law={null}");
    expect(form).toContain('action: law ? "atualizar" : "criar"');
    expect(form).toContain('fetch("/api/admin/comercial/leis"');
    expect(form).toContain('router.replace(`/admin/leis/${encodeURIComponent(nextSlug)}`)');
    expect(read("components/admin/commercial-admin.tsx")).toContain("<LawDataFields law={editing} />");
  });

  it("compartilha o editor estrutural e permite pdf_page sem reparentear ou reordenar", () => {
    const oldPanel = read("components/admin/admin-questoes.tsx");
    const central = read("components/admin/law-structure-page-client.tsx");
    const editor = read("components/admin/law-structure-admin.tsx");
    const server = read("lib/admin-questoes-server.ts");
    expect(oldPanel).toContain("<LawStructureAdmin");
    expect(central).toContain("<LawStructureAdmin");
    expect(editor).toContain("A estrutura pertence à lei e pode ser cadastrada antes de questões ou arquivos Anki.");
    expect(editor).toContain("Página PDF");
    expect(server).toContain("pdf_page");
    const update = server.slice(server.indexOf("export async function updateStructureNode"), server.indexOf("export async function deactivateStructureNode"));
    expect(update).not.toContain("parent_id:");
    expect(update).not.toContain("ordem:");
  });
});
