import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync("supabase/migrations/20260910140000_create_records_product_ranking.sql", "utf8");
const loader = readFileSync("lib/records-ranking-server.ts", "utf8");
const page = readFileSync("components/records-page.tsx", "utf8");
const admin = readFileSync("components/admin/commercial-admin.tsx", "utf8");
const upload = readFileSync("app/api/admin/comercial/produtos/[id]/imagem/route.ts", "utf8");
const personalMigration = readFileSync("supabase/migrations/20260910150000_create_records_personalization.sql", "utf8");
const recordsPage = readFileSync("components/records-ranking-page.tsx", "utf8");

describe("Records por produto habilitado", () => {
  it("cria uma RPC própria sem alterar a RPC legada", () => {
    expect(migration).toContain("create function public.obter_ranking_produto_records");
    expect(migration).toContain("and ativo = true");
    expect(migration).toContain("and records_enabled = true");
    expect(migration).not.toContain("tipo_produto = 'edital'");
    expect(migration).toContain("join public.produto_leis as pl");
    expect(migration).toContain("where c.score_version = 2");
    expect(migration).toContain("order by score_total desc, score_total_em asc nulls last, aluno_id asc");
    expect(migration).not.toContain("obter_ranking_produto_edital(");
  });

  it("carrega e lista Records apenas por ativo e records_enabled", () => {
    expect(loader).toContain('.eq("ativo", true).eq("records_enabled", true)');
    expect(loader).not.toContain('.eq("tipo_produto", "edital")');
    expect(loader).toContain('rpc("obter_detalhes_records_produto"');
    expect(loader).toContain("resolveRecordsContestImage");
    expect(loader).toContain("productHref: `/leisflashcards/");
    expect(loader).not.toContain('from("ligas")');
    expect(loader).not.toContain("legacyLeagueForProduct");
    expect(loader).not.toContain("LeagueRow");
    expect(loader).not.toContain("legacyLeagueSlug");
    expect(loader).not.toContain("league:");
  });

  it("usa tipo somente para organizar a galeria e libera o admin/upload para qualquer produto", () => {
    expect(page).toContain('contest.productType === "edital"');
    expect(page).toContain('contest.productType === "lei_avulsa"');
    expect(admin).not.toContain('{productType === "edital" ? <section className="commercial-settings-group"><h3>Records</h3>');
    expect(admin).toContain("Este produto está habilitado no Records, mas não possui leis vinculadas");
    expect(upload).not.toContain('product.tipo_produto !== "edital"');
  });

  it("calcula Top 10, janela próxima e scores por lei no banco", () => {
    expect(personalMigration).toContain("create function public.obter_detalhes_records_produto");
    expect(personalMigration).toContain("where c.score_version = 2");
    expect(personalMigration).toContain("join public.produto_leis pl");
    expect(personalMigration).toContain("where a.posicao > 10");
    expect(personalMigration).toContain("l.inicio + 9");
    expect(personalMigration).toContain("coalesce((select m.melhor_score");
    expect(loader).toContain('rpc("obter_detalhes_records_produto"');
    expect(recordsPage).toContain("Pontuação por lei");
    expect(recordsPage).toContain("Posições próximas");
    expect(recordsPage).toContain("data.contest.productHref");
  });
});
