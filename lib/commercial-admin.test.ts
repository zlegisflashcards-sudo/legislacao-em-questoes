import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  CommercialValidationError,
  idList,
  limitFrom,
  safeSearch,
  slug,
  uuid,
} from "./commercial-admin-validation";

const migration = readFileSync("supabase/migrations/20260805171529_create_commercial_admin_rpcs.sql", "utf8");
const server = readFileSync("lib/commercial-admin-server.ts", "utf8");
const client = readFileSync("components/admin/commercial-admin.tsx", "utf8");
const page = readFileSync("app/admin/comercial/page.tsx", "utf8");

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

  it("expõe somente os sete recursos administrativos previstos", () => {
    for (const resource of ["leis", "materiais", "produtos", "aquisicoes", "liberacoes", "auditoria", "alunos"]) {
      expect(readFileSync(`app/api/admin/comercial/${resource}/route.ts`, "utf8")).toContain("handleCommercialGet");
    }
    expect(readFileSync("app/api/admin/comercial/auditoria/route.ts", "utf8")).not.toContain("handleCommercialMutation");
    expect(readFileSync("app/api/admin/comercial/alunos/route.ts", "utf8")).not.toContain("handleCommercialMutation");
  });

  it("limita busca explícita de alunos e pagina as listagens", () => {
    expect(server).toContain("if (q.length < 3)");
    expect(server).toContain("Math.min(limit, 10)");
    expect(server).toContain(".range(from, to)");
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
    expect(client).toContain("sem efeito retroativo");
  });

  it("mantém o fluxo Hotmart existente fora da nova implementação", () => {
    expect(server).not.toContain("lib/hotmart");
    expect(client).not.toContain("webhook");
    expect(migration).not.toContain("hotmart_eventos");
  });
});
