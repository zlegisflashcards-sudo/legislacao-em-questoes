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
    expect(overview).toContain("LawOverviewCards");
    expect(read("components/admin/law-overview-cards.tsx")).toContain("law-center-operation-card");
    expect(overview).not.toContain("Math.random");
  });

  it("ordena os cards e mantém checklist administrativo isolado por lei", () => {
    const overview = read("app/admin/leis/[slug]/page.tsx");
    const cards = read("components/admin/law-overview-cards.tsx");
    const checks = read("supabase/migrations/20260924122000_add_admin_law_overview_checks.sql");
    expect(overview.indexOf('id: "estrutura"')).toBeLessThan(overview.indexOf('id: "materiais"'));
    expect(overview.indexOf('id: "materiais"')).toBeLessThan(overview.indexOf('id: "legiscast"'));
    expect(overview.indexOf('id: "legiscast"')).toBeLessThan(overview.indexOf('id: "anki"'));
    expect(overview.indexOf('id: "anki"')).toBeLessThan(overview.indexOf('id: "questoes"'));
    expect(overview.indexOf('id: "questoes"')).toBeLessThan(overview.indexOf('id: "recortes"'));
    expect(overview).toContain("law-center-editorial-warning");
    expect(cards).toContain("aria-pressed");
    expect(checks).toContain("admin_law_overview_checks");
    expect(checks).toContain("row level security");
    expect(checks).toContain("to service_role");
  });

  it("oferece próximos passos nos vazios sem criar fluxos paralelos", () => {
    expect(read("components/admin/law-structure-admin.tsx")).toContain("Criar primeiro Título");
    expect(read("components/admin/admin-question-scopes.tsx")).toContain("Criar primeiro recorte");
    expect(read("components/admin/admin-law-questions.tsx")).toContain("Abrir Anki");
    expect(read("components/admin/admin-materials.tsx")).toContain("primeiro material já vinculado a esta lei");
    expect(read("components/admin/legiscast-audios-admin.tsx")).toContain("primeiro áudio da lei");
  });

  it("mantém os campos e a API comercial de leis concentrados na Central", () => {
    const commercial = read("components/admin/commercial-admin.tsx");
    const newPanel = read("components/admin/law-data-admin.tsx");
    const fields = read("components/admin/law-data-fields.tsx");
    expect(commercial).not.toContain("LawDataFields");
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
    expect(read("components/admin/commercial-admin.tsx")).not.toContain("LawDataFields");
  });

  it("oferece exclusão integral da lei com prévia, confirmação e RPC restrita", () => {
    const form = read("components/admin/law-data-admin.tsx");
    const server = read("lib/commercial-admin-server.ts");
    const deletion = read("supabase/migrations/20260924120000_add_admin_full_law_deletion.sql");
    expect(form).toContain("Excluir lei definitivamente");
    expect(form).toContain('action: "resumo_exclusao"');
    expect(form).toContain('action: "excluir_definitivamente"');
    expect(form).toContain("Digite <strong>EXCLUIR</strong>");
    expect(server).toContain('rpc("admin_delete_law_definitively"');
    expect(server).toContain("20260924120000_add_admin_full_law_deletion.sql");
    expect(server).toContain("Identificador da operação");
    expect(server).toContain("operationId");
    for (const item of ["produto_leis", "liberacoes_leis", "recortes_leis", "materiais_leis", "historico_atualizacoes_leis", "editais_personalizados_leis", "ligas_leis"]) expect(deletion).toContain(`delete from public.${item}`);
    expect(deletion).toContain("pg_advisory_xact_lock");
    expect(deletion).toContain("set search_path = ''");
    expect(deletion).toContain("to service_role");
  });

  it("mantém a RPC de exclusão compatível antes e depois do campo MP3 opcional", () => {
    const correction = read("supabase/migrations/20260924121000_fix_admin_law_deletion_mp3_compatibility.sql");
    expect(correction).toContain("pg_catalog.to_jsonb(j) ->> 'mp3_path'");
    expect(correction).not.toContain("select j.mp3_path");
    expect(correction).toContain("set search_path = ''");
    expect(correction).toContain("to service_role");
  });

  it("compartilha o editor estrutural, permite pdf_page e reordena apenas irmãos", () => {
    const central = read("components/admin/law-structure-page-client.tsx");
    const editor = read("components/admin/law-structure-admin.tsx");
    const server = read("lib/admin-questoes-server.ts");
    expect(central).toContain("<LawStructureAdmin");
    expect(editor).toContain("A estrutura pertence à lei e pode ser cadastrada antes de questões ou arquivos Anki.");
    expect(editor).toContain("Página PDF");
    expect(server).toContain("pdf_page");
    const update = server.slice(server.indexOf("export async function updateStructureNode"), server.indexOf("export async function deactivateStructureNode"));
    expect(update).not.toContain("parent_id:");
    expect(server).toContain('export async function reorderStructureNodes');
    expect(server).toContain('"A reordenação só é permitida entre estruturas irmãs."');
    expect(server).toContain('"A ordem deve conter exatamente todas as estruturas irmãs."');
    expect(editor).toContain('action: "reordenar_estruturas"');
    expect(editor).toContain("pendingSiblingOrders");
    expect(editor).toContain("A posição anterior foi restaurada.");
  });
});
