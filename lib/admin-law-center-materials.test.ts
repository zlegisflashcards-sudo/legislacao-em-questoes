import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf8");
const client = read("components/admin/admin-materials.tsx");
const legacy = read("components/admin/commercial-admin.tsx");
const server = read("lib/commercial-admin-server.ts");
const contextRoute = read("app/api/admin/leis/[slug]/materiais/route.ts");

describe("Materiais na Central da Lei", () => {
  it("cria a rota contextual e resolve a lei pelo slug", () => {
    const page = "app/admin/leis/[slug]/materiais/page.tsx";
    expect(existsSync(page)).toBe(true);
    expect(read(page)).toContain("getAdminLawBySlug");
    expect(read(page)).toContain("<LawMaterialsAdmin law=");
    expect(client).toContain("encodeURIComponent(law.slug)");
  });

  it("lista somente materiais da lei atual, inclusive quando a lista está vazia", () => {
    expect(contextRoute).toContain('url.searchParams.set("lei_id", String(law.id))');
    expect(server).toContain('query.eq("lei_id", positiveIntegerId(leiId, "Lei"))');
    expect(client).toContain("rows={result.items}");
    expect(client).toContain("{result.total} registro(s)");
  });

  it("cria material já vinculado à lei contextual sem seletor redundante", () => {
    expect(client).toContain("fixedLaw ? Number(fixedLaw.id) : Number(data.lei_id)");
    expect(client).toContain("!editing && !fixedLaw");
    expect(read("app/admin/leis/[slug]/materiais/page.tsx")).not.toContain("LawSearchSelect");
    expect(server).toContain("Number(data.lei_id) !== contextLawId");
  });

  it("edita e ativa somente materiais pertencentes à lei contextual", () => {
    expect(contextRoute).toContain('handleCommercialMutation("materiais", request, { lawId: law.id })');
    expect(server).toContain('.eq("id", materialId).eq("lei_id", contextLawId)');
    expect(server).toContain("Material não encontrado para a lei selecionada.");
    expect(client).toContain('action: "atualizar", id: row.id, data: { ativo: !row.ativo }');
  });

  it("preserva todos os campos e enumerações do formulário existente", () => {
    for (const field of ["tipo", "titulo", "descricao", "provedor", "url_externa", "acao", "quantidade_itens", "versao_material", "revisado_em", "publicado_em", "data_entrega_prevista", "observacao_interna", "ordem", "ativo"]) expect(client).toContain(`name="${field}"`);
    for (const value of ["flashcards", "video", "pdf", "tutorial", "audio", "outro", "google_drive", "youtube", "externo", "supabase_storage", "abrir", "baixar", "assistir"]) expect(client).toContain(value);
  });

  it("mantém Admin Comercial e Central no mesmo MaterialPanel", () => {
    expect(legacy).toContain('tab === "materiais" ? <MaterialPanel');
    expect(legacy).toContain('from "@/components/admin/admin-materials"');
    expect(client).toContain("<MaterialPanel rows={result.items} laws={[law]} fixedLaw={law}");
    expect(client.match(/function MaterialPanel/g)).toHaveLength(1);
  });

  it("mantém autenticação, validações e RPCs comerciais existentes", () => {
    expect(contextRoute).toContain("obterAdministrador");
    expect(contextRoute).toContain("status: 401");
    expect(server).toContain("const admin = await requireAdmin()");
    expect(server).toContain("validateMaterialData(body.data)");
    expect(server).toContain('rpc("admin_criar_material_lei"');
    expect(server).toContain('rpc("admin_atualizar_material_lei"');
    expect(server).toContain("MATERIAL_TYPES");
    expect(server).toContain("MATERIAL_PROVIDERS");
    expect(server).toContain("MATERIAL_ACTIONS");
  });

  it("atualiza a navegação e o atalho da visão geral", () => {
    expect(read("app/admin/leis/[slug]/layout.tsx")).toContain('href={`${base}/materiais`}');
    expect(read("app/admin/leis/[slug]/page.tsx")).toContain('href: `${base}/materiais`');
  });
});
