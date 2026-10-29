import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { lawMaterialFormData } from "./law-material-form";

const read = (path: string) => readFileSync(path, "utf8");
const client = read("components/admin/admin-materials.tsx");
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
    expect(client).toContain("Number(fixedLaw.id), Boolean(editing)");
    expect(client).toContain("!editing && !fixedLaw");
    expect(read("app/admin/leis/[slug]/materiais/page.tsx")).not.toContain("LawSearchSelect");
    expect(server).toContain("Number(data.lei_id) !== contextLawId");
  });

  it("simplifica o formulário contextual e preserva os demais dados na edição", () => {
    expect(client).toContain('"Legislação esquematizada"');
    expect(client).toContain('editing ? text(editing.titulo) : text(fixedLaw.titulo)');
    expect(lawMaterialFormData({ titulo: "Lei exemplo", url_externa: "https://example.com/lei.pdf" }, 12, false)).toEqual({ titulo: "Lei exemplo", url_externa: "https://example.com/lei.pdf", lei_id: 12, tipo: "pdf", provedor: "externo", acao: "abrir", ordem: 0, ativo: true });
    expect(lawMaterialFormData({ titulo: "Lei exemplo", url_externa: "https://drive.google.com/file/d/123/view" }, 12, false)).toMatchObject({ provedor: "google_drive" });
    expect(lawMaterialFormData({ titulo: "Novo título", url_externa: "" }, 12, true)).toEqual({ titulo: "Novo título", url_externa: "" });
  });

  it("edita e ativa somente materiais pertencentes à lei contextual", () => {
    expect(contextRoute).toContain('handleCommercialMutation("materiais", request, { lawId: law.id })');
    expect(server).toContain('.eq("id", materialId).eq("lei_id", contextLawId)');
    expect(server).toContain("Material não encontrado para a lei selecionada.");
    expect(client).toContain('action: "atualizar", id: row.id, data: { ativo: !row.ativo }');
  });

  it("permite visualizar o PDF vinculado sem oferecer um link vazio", () => {
    expect(client).toContain('const materialUrl = (row: Row) => text(row.url_externa).trim()');
    expect(client).toContain('>Visualizar PDF</a>');
    expect(client).toContain('"PDF sem URL cadastrada"');
  });

  it("envia a ação padrão única para materiais", () => {
    for (const field of ["tipo", "titulo", "descricao", "provedor", "url_externa", "acao", "quantidade_itens", "versao_material", "revisado_em", "publicado_em", "data_entrega_prevista", "observacao_interna", "ordem", "ativo"]) expect(client).toContain(`name="${field}"`);
    for (const value of ["google_drive", "youtube", "externo", "supabase_storage"]) expect(client).toContain(value);
    expect(client).toContain('name="tipo" type="hidden" value="pdf"');
    expect(client).toContain('name="acao" type="hidden" value="abrir"');
    expect(client).not.toContain('["flashcards","video","pdf","tutorial","audio","outro"].map');
    expect(client).not.toContain('["abrir","baixar","assistir"].map');
  });

  it("mantém a Central da Lei no MaterialPanel compartilhado", () => {
    expect(client).toContain("<MaterialPanel rows={result.items} laws={[law]} fixedLaw={law}");
    expect(client.match(/function MaterialPanel/g)).toHaveLength(1);
    expect(client).toContain('import { LawSearchSelect } from "@/components/law-search-select"');
    expect(client).toContain("<MaterialLawSelect laws={laws}");
    expect(client).toContain('emptyLabel="Selecionar lei do material"');
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
