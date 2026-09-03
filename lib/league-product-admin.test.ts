import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { CommercialValidationError, optionalLeagueUrl } from "@/lib/commercial-admin-validation";

const migration = readFileSync("supabase/migrations/20260903120000_link_law_leagues_to_products.sql", "utf8");
const server = readFileSync("lib/commercial-admin-server.ts", "utf8");
const client = readFileSync("components/admin/commercial-admin.tsx", "utf8");

describe("configuração de Liga pelo produto-edital", () => {
  it("mantém a configuração 1:1 na tabela de Ligas, sem poluir produtos", () => {
    expect(migration).toContain("add column if not exists produto_id uuid");
    expect(migration).toContain("add column if not exists subtitulo text");
    expect(migration).toContain("add column if not exists cta_label text");
    expect(migration).toContain("add column if not exists cta_href text");
    expect(migration).toContain("ligas_produto_unico_idx");
    expect(migration).not.toContain("alter table public.produtos add column");
  });

  it("prepara PMMA com o produto e os defaults atuais", () => {
    for (const value of ["produto.slug = 'pmmasd'", "'Liga PMMA'", "'Ranking Legis Questões'", "'/league/pmma-hero.png'", "'🎮 Quero entrar na Liga PMMA'"]) expect(migration).toContain(value);
  });

  it("usa URLs HTTP(S) ou assets públicos e rejeita protocolos perigosos", () => {
    expect(optionalLeagueUrl("/league/pmma-hero.png", "Banner")).toBe("/league/pmma-hero.png");
    expect(optionalLeagueUrl("https://cdn.example.com/banner.webp", "Banner")).toBe("https://cdn.example.com/banner.webp");
    expect(() => optionalLeagueUrl("javascript:alert(1)", "Banner")).toThrow(CommercialValidationError);
  });

  it("permite somente edital, bloqueia slug duplicado e desabilita por ativo", () => {
    expect(server).toContain('action === "atualizar_liga"');
    expect(server).toContain('product.data.tipo_produto !== "edital"');
    expect(server).toContain('eq("slug", settings.slug).neq("produto_id", productId)');
    expect(server).toContain('update({ ativo: false');
  });

  it("expõe a seção no editor de produto sem criar outra lista de leis", () => {
    expect(client).toContain("Configuração da Liga");
    expect(client).toContain("Liga habilitada");
    expect(client).toContain("Prévia do banner da Liga");
    expect(client).toContain("A Liga herda automaticamente as leis da composição deste produto-edital.");
    expect(client).not.toContain("Leis da Liga");
  });
});
