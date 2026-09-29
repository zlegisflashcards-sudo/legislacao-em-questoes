import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync("supabase/migrations/20260928130000_add_free_recorte_study_campaigns.sql", "utf8");
const rankingMigration = readFileSync("supabase/migrations/20260928140000_add_recorte_campaign_ranking.sql", "utf8");
const contexts = readFileSync("lib/law-question-scope-access.ts", "utf8");
const authorization = readFileSync("lib/law-question-scope-auth.ts", "utf8");
const campaigns = readFileSync("lib/law-campaign-server.ts", "utf8");

describe("acesso e Estudo Ativo por recorte", () => {
  it("mantém o acesso gratuito no próprio recorte", () => {
    expect(migration).toContain("add column if not exists acesso_gratuito boolean not null default false");
    expect(migration).toContain("Somente recorte ativo pode ter acesso gratuito");
    expect(contexts).toContain("acesso_gratuito.eq.true");
    expect(authorization).toContain("authenticateLawStudent");
    expect(authorization).not.toContain("authorizeLawStudy(request, slug)");
  });

  it("separa campanhas e progresso de recorte da lei completa", () => {
    expect(migration).toContain("progresso_recortes_leis_alunos");
    expect(migration).toContain("campanhas_leis_alunos_ativa_recorte_unica_idx");
    expect(migration).toContain("O recorte deve pertencer à mesma lei");
    expect(campaigns).toContain('context.recorte ? "progresso_recortes_leis_alunos" : "progresso_leis_alunos"');
    expect(campaigns).toContain("recorte_id: context.recorte?.id ?? null");
    expect(campaigns).toContain("resolveQuestionsForLawScope(context.lawId, context.recorte?.id ?? null)");
  });

  it("não mistura a classificação da lei inteira com tentativa de recorte", () => {
    expect(rankingMigration).toContain("obter_resultado_campanha_recorte");
    expect(campaigns).toContain('supabase.rpc("obter_resultado_campanha_recorte"');
    expect(campaigns).toContain("p_recorte_id: context.recorte.id");
  });
});
