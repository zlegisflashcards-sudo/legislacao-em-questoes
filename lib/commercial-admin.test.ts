import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  CommercialValidationError,
  EDITORIAL_IMPORTANCE,
  EDITORIAL_UPDATE_TYPES,
  LAW_UPDATE_STATUSES,
  idList,
  limitFrom,
  optionalIsoDate,
  optionalNonNegativeInteger,
  optionalProductDemoVideoUrl,
  productLawLinks,
  safeSearch,
  slug,
  uuid,
} from "./commercial-admin-validation";

const migration = readFileSync("supabase/migrations/20260805171529_create_commercial_admin_rpcs.sql", "utf8");
const editorialMigration = readFileSync("supabase/migrations/20260806112619_create_law_editorial_metadata.sql", "utf8");
const server = readFileSync("lib/commercial-admin-server.ts", "utf8");
const client = readFileSync("components/admin/commercial-admin.tsx", "utf8");
const studentCrm = readFileSync("components/admin/student-postsale-crm.tsx", "utf8");
const studentsAdmin = readFileSync("components/admin/students-admin.tsx", "utf8");
const page = readFileSync("app/admin/comercial/page.tsx", "utf8");
const productVideoMigration = readFileSync("supabase/migrations/20260807210000_add_product_demo_video.sql", "utf8");
const productHighlightMigration = readFileSync("supabase/migrations/20260808010000_add_product_highlight.sql", "utf8");
const postSaleFinalOutcomeMigration = readFileSync("supabase/migrations/20260815100000_add_purchase_post_sale_final_outcome.sql", "utf8");

describe("validação da administração comercial", () => {
  it("aceita slug normalizado e rejeita valores perigosos", () => {
    expect(slug("lei-8112")).toBe("lei-8112");
    expect(() => slug("Lei 8.112")).toThrow(CommercialValidationError);
  });

  it("valida UUID e listas de leis sem duplicidade", () => {
    expect(uuid("00000000-0000-4000-8000-000000000003", "Produto")).toContain("4000");
    expect(idList([1, 2, 3], "Leis")).toEqual([1, 2, 3]);
    expect(() => idList([1, 1], "Leis")).toThrow(CommercialValidationError);
  });

  it("limita paginação e neutraliza operadores PostgREST na busca", () => {
    expect(limitFrom("9999")).toBe(50);
    expect(safeSearch("nome%,id.eq.1()")).not.toMatch(/[%(),]/);
  });

  it("valida datas, quantidades e vocabulários editoriais", () => {
    expect(optionalIsoDate("2026-08-06", "Data")).toBe("2026-08-06");
    expect(() => optionalIsoDate("2026-02-30", "Data")).toThrow(CommercialValidationError);
    expect(optionalNonNegativeInteger(0, "Quantidade")).toBe(0);
    expect(() => optionalNonNegativeInteger(-1, "Quantidade")).toThrow(CommercialValidationError);
    expect(LAW_UPDATE_STATUSES).toContain("revisao_pendente");
    expect(EDITORIAL_UPDATE_TYPES).toContain("alteracao_legislativa");
    expect(EDITORIAL_IMPORTANCE).toEqual(["informativa", "recomendada", "essencial"]);
  });

  it("aceita URLs normais do YouTube e as normaliza para o player", () => {
    for (const url of [
      "https://www.youtube.com/watch?v=LDa1zANCIQY",
      "https://youtu.be/LDa1zANCIQY",
      "https://www.youtube.com/embed/LDa1zANCIQY",
    ]) expect(optionalProductDemoVideoUrl(url, "Vídeo")).toBe("https://www.youtube.com/embed/LDa1zANCIQY");
    expect(() => optionalProductDemoVideoUrl("ftp://youtube.com/watch?v=LDa1zANCIQY", "Vídeo")).toThrow(CommercialValidationError);
    expect(() => optionalProductDemoVideoUrl("https://www.youtube.com/watch?v=invalido", "Vídeo")).toThrow(CommercialValidationError);
  });

  it("aceita somente o contrato explícito de lei completa ou recorte coerente", () => {
    const scopeId = "00000000-0000-4000-8000-000000000004";
    expect(productLawLinks([{ lei_id: 7, recorte_id: null, recorte_lei_id: null }])).toEqual([{ lei_id: 7, recorte_id: null, recorte_lei_id: null }]);
    expect(productLawLinks([{ lei_id: 7, recorte_id: scopeId, recorte_lei_id: 7 }])).toEqual([{ lei_id: 7, recorte_id: scopeId, recorte_lei_id: 7 }]);
    expect(() => productLawLinks([{ lei_id: 7, recorte_id: scopeId, recorte_lei_id: 8 }])).toThrow("mesma lei");
    expect(() => productLawLinks([{ lei_id: 7, recorte_id: null, recorte_lei_id: 7 }])).toThrow("exige um recorte");
    expect(() => productLawLinks([{ lei_id: 7, recorte_id: null, recorte_lei_id: null, inesperado: true }])).toThrow("campos não permitidos");
  });
});

describe("fronteira administrativa comercial", () => {
  it("protege a página com a autenticação administrativa existente", () => {
    expect(page).toContain("await exigirAdministrador()");
    expect(page).toContain("<CommercialAdmin />");
  });

  it("protege todas as consultas e mutações antes do service role", () => {
    expect(server.match(/await requireAdmin\(\)/g)).toHaveLength(2);
    expect(server).toContain("const admin = await requireAdmin()");
    expect(server).toContain('import "server-only"');
    expect(client).not.toContain("SUPABASE_SERVICE_ROLE_KEY");
  });

  it("expõe somente os oito recursos administrativos previstos", () => {
    for (const resource of ["leis", "materiais", "produtos", "aquisicoes", "liberacoes", "atualizacoes", "auditoria", "alunos"]) {
      expect(readFileSync(`app/api/admin/comercial/${resource}/route.ts`, "utf8")).toContain("handleCommercialGet");
    }
    expect(readFileSync("app/api/admin/comercial/auditoria/route.ts", "utf8")).not.toContain("handleCommercialMutation");
    expect(readFileSync("app/api/admin/comercial/alunos/route.ts", "utf8")).toContain("handleCommercialMutation");
    expect(readFileSync("app/api/admin/comercial/anki-tutoriais/route.ts", "utf8")).toContain("handleCommercialMutation");
    expect(client).toContain('resource === "anki_tutoriais" ? "anki-tutoriais" : resource');
  });

  it("mantém histórico editorial separado da auditoria técnica", () => {
    expect(client).toContain('{ id: "atualizacoes", label: "Atualizações" }');
    expect(client).toContain("function EditorialUpdatesPanel");
    expect(client).toContain("function AuditPanel");
    expect(server).toContain('.from("historico_atualizacoes_leis")');
  });

  it("pagina a lista administrativa de alunos e aplica filtros no backend", () => {
    expect(server).toContain('rpc("admin_listar_alunos"');
    expect(server).toContain('"duplicados"');
    expect(server).toContain(".range(from, to)");
    expect(productVideoMigration).toContain("add column if not exists video_demo_url text");
    expect(productVideoMigration).toContain("p_video_demo_url text");
    expect(productVideoMigration).toContain("p_dados?'video_demo_url'");
    expect(server).toContain('"video_demo_url"');
    expect(client).toContain('name="video_demo_url"');
    expect(productHighlightMigration).toContain("add column if not exists destaque boolean not null default false");
    expect(productHighlightMigration).toContain("p_destaque boolean");
    expect(productHighlightMigration).toContain("p_dados?'destaque'");
    expect(server).toContain('"destaque"');
    expect(client).toContain('name="destaque"');
  });

  it("mantém a fila por compra resiliente a compras órfãs e ao identificador real do e-mail", () => {
    expect(server).toContain('.not("aluno_id", "is", null)');
    expect(server).toContain("function accessEmailForPurchase");
    expect(server).toContain("`hotmart:${externalId}`");
    expect(server).toContain("`administrativo:${purchaseId}`");
    expect(server).toContain("async function loadPostSalePending");
    expect(server).toContain("crm_resumo: crm.resumo");
    expect(server).toContain("crm_avisos: crm.warnings");
    expect(server).not.toContain("Não foi possível consultar os e-mails de acesso.");
  });

  it("exibe cada ciclo por compra em etapas verticais expansíveis", () => {
    expect(studentCrm).toContain("expandedPurchase");
    expect(studentCrm).toContain('className="purchase-crm-summary"');
    expect(studentCrm).toContain('className="crm-stage-list"');
    expect(studentCrm).toContain("Liberações / aquisições desta compra");
    expect(studentCrm).toContain("Marcar como concluída manualmente");
    expect(studentCrm).toContain("Remover conclusão manual");
    expect(studentCrm).toContain("Abrir WhatsApp");
  });

  it("mantém a fila compacta e pagina alunos em lotes de cinquenta", () => {
    expect(studentsAdmin).toContain("limit=50&page=${nextPage}");
    expect(studentsAdmin).toContain("setPendingSales(data.crm_pendencias_exibidas ?? [])");
    expect(server).toContain("filteredItems.slice(0, 5)");
    expect(server).toContain("crm_pendencias_exibidas: crm.visibleItems");
    expect(studentsAdmin).not.toContain("Ver todas as pendências");
    expect(server).toContain('.order("adquirida_em", { ascending: true }).order("id", { ascending: true })');
  });

  it("filtra a fila no backend e preserva o limite operacional de cinco", () => {
    expect(server).toContain("crm_etapa");
    expect(server).toContain("filteredItems.slice(0, 5)");
    expect(studentsAdmin).toContain("Todos {pendingTotal}");
    expect(studentsAdmin).toContain("Nenhuma compra pendente nesta etapa.");
    expect(studentsAdmin).toContain("setPendingStage(stage)");
  });

  it("vincula o e-mail de acesso à compra e encerra a etapa final por resultado", () => {
    expect(studentCrm).toContain('action: "enviar_email_acesso", id, data: { compra_id: compra }');
    expect(server).toContain('purchaseId: compraId');
    expect(server).toContain('administrativo:${purchaseId}');
    expect(studentCrm).toContain("Enviar mensagem pelo WhatsApp");
    expect(studentCrm).toContain("Retorno final do cliente");
    expect(studentCrm).toContain("Cliente confirmou");
    expect(studentCrm).toContain("Cliente não respondeu");
    expect(server).toContain("etapa_6_cliente_confirmou");
    expect(server).toContain("etapa_6_cliente_nao_respondeu");
    expect(postSaleFinalOutcomeMigration).toContain("resultado_final in ('cliente_confirmou', 'nao_respondeu')");
  });

  it("conclui a Etapa 3 somente pela confirmação final e sem disparar e-mail", () => {
    const start = server.indexOf('resource === "alunos" && action === "crm_compra_atualizar"');
    const end = server.indexOf('resource === "alunos" && action === "crm_detalhe"');
    const crmPurchaseUpdate = server.slice(start, end);

    expect(crmPurchaseUpdate).toContain('shouldAutoCompleteStage3AfterFinalConfirmation({ finalOutcome: "cliente_confirmou", emailSent, stage3Completed })');
    expect(crmPurchaseUpdate).toContain('etapa: 3');
    expect(crmPurchaseUpdate).toContain('etapa_3_concluida_automaticamente_por_confirmacao_final');
    expect(crmPurchaseUpdate).toContain('.eq("compra_id", compraId)');
    expect(crmPurchaseUpdate).not.toContain("sendManualStudentAccessEmail");
    expect(crmPurchaseUpdate).not.toContain("deliverStudentAccessEmail");
    expect(crmPurchaseUpdate).not.toContain("sendPostSaleAccessEmails");
  });
});

describe("metadados editoriais das leis", () => {
  it("amplia leis e materiais sem duplicar quantidade na lei", () => {
    for (const field of ["norma_originaria_referencia", "houve_alteracao_legislativa", "ultima_alteracao_referencia", "situacao_atualizacao", "quantidade_itens", "versao_material", "revisado_em", "publicado_em", "observacao_interna"]) expect(editorialMigration).toContain(field);
    expect(editorialMigration).not.toMatch(/add column if not exists numero_flashcards/i);
  });

  it("cria histórico protegido e RPC transacional de nova versão", () => {
    expect(editorialMigration).toContain("create table if not exists public.historico_atualizacoes_leis");
    expect(editorialMigration).toContain("alter table public.historico_atualizacoes_leis enable row level security");
    expect(editorialMigration).toContain("function public.admin_publicar_nova_versao_material");
    expect(editorialMigration).toContain("for update");
    expect(editorialMigration).toContain("'incremental',false");
    expect(editorialMigration).not.toMatch(/\bguid\b/i);
  });

  it("não expõe URL nem observação interna no resumo futuro", () => {
    const view = editorialMigration.slice(editorialMigration.indexOf("create or replace view public.resumo_editorial_leis"), editorialMigration.indexOf("-- Sobrecarga editorial"));
    expect(view).not.toContain("url_externa");
    expect(view).not.toContain("observacao_interna");
    expect(client).not.toContain("SUPABASE_SERVICE_ROLE_KEY");
  });

  it("não implementa integração externa, interface pública ou pacote incremental", () => {
    expect(editorialMigration).not.toMatch(/hotmart_eventos|mercado.?pago|googleapis|drive\.files/i);
    expect(server).not.toMatch(/mercado.?pago|googleapis|drive\.files/i);
    expect(client).toContain("Não cria pacote incremental, GUID ou merge de deck.");
  });
});

describe("operações comerciais auditáveis", () => {
  const rpcNames = [
    "admin_criar_lei", "admin_atualizar_lei", "admin_criar_material_lei", "admin_atualizar_material_lei",
    "admin_criar_produto", "admin_atualizar_produto", "admin_definir_leis_produto", "admin_registrar_aquisicao",
    "admin_cancelar_aquisicao", "admin_reembolsar_aquisicao", "admin_reativar_aquisicao",
    "admin_conceder_lei_manual", "admin_revogar_liberacao",
  ];

  it("cria as treze RPCs SECURITY DEFINER e restringe EXECUTE", () => {
    for (const name of rpcNames) expect(migration).toContain(`function public.${name}`);
    expect(migration.match(/security definer/gi)?.length).toBeGreaterThanOrEqual(13);
    expect(migration).toContain("from public, anon, authenticated");
    expect(migration).toContain("to service_role");
  });

  it("valida claim service_role e existência do ator Auth", () => {
    expect(migration).toContain("request.jwt.claim.role");
    expect(migration).toContain("request.jwt.claims");
    expect(migration).toContain("from auth.users where id = p_ator_user_id");
  });

  it("preserva histórico e impede concessão retroativa na reativação", () => {
    expect(migration).not.toMatch(/delete from public\.(compras|liberacoes_leis)/i);
    expect(migration).toContain("somente_historicas");
    expect(migration).toContain("concessao_retroativa',false");
  });

  it("registra auditoria com estados anterior e posterior", () => {
    expect(migration).toContain("public.auditoria_administrativa");
    expect(migration).toContain("estado_anterior, estado_posterior");
    expect(migration.match(/admin_comercial_auditar/g)?.length).toBeGreaterThanOrEqual(12);
  });

  it("confirma operações sensíveis e não usa estado persistente no navegador", () => {
    expect(client.match(/window\.confirm/g)?.length).toBeGreaterThanOrEqual(3);
    expect(client).not.toContain("localStorage");
    expect(client).not.toContain("sessionStorage");
    expect(client).toContain("Composição ordenada atualizada.");
  });

  it("mantém o fluxo Hotmart existente fora da nova implementação", () => {
    expect(server).not.toContain("lib/hotmart");
    expect(client).not.toContain("webhook");
    expect(migration).not.toContain("hotmart_eventos");
  });

  it("salva a composição do produto por RPC de recortes e mantém whitelist estrita", () => {
    expect(server).toContain('resource === "produtos" && action === "definir_leis"');
    expect(server).toContain('productLawLinks(body.vinculos)');
    expect(server).toContain('rpc("admin_definir_leis_produto_recortes"');
    expect(client).toContain("recorte_lei_id: scopeByLaw[lei_id] ? Number(lei_id) : null");
  });
});
