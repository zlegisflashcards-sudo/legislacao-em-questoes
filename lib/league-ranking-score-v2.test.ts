import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync("supabase/migrations/20260903120000_link_law_leagues_to_products.sql", "utf8");

describe("ranking da Liga competitivo V2", () => {
  it("considera somente V2, inclusive campanhas em andamento", () => {
    expect(migration).toContain("where c.score_version = 2");
    expect(migration).not.toContain("c.concluida = true");
    expect(migration).toContain("coalesce(c.score_ajustado, c.score)");
  });

  it("mantém apenas o melhor score por aluno e lei antes de somar a Liga", () => {
    expect(migration).toContain("group by c.aluno_id, c.lei_id");
    expect(migration).toContain("sum(melhor_score)::bigint as score_total");
  });

  it("deriva as leis exclusivamente da composição viva do produto", () => {
    expect(migration).toContain("add column if not exists produto_id uuid");
    expect(migration).toContain("join public.produto_leis as pl");
    expect(migration).not.toContain("join public.ligas_leis");
    expect(migration).toContain("produto.slug = 'pmmasd'");
  });

  it("desempata por quando o score total foi atingido e por aluno", () => {
    expect(migration).toContain("max(melhor_score_em) as score_total_em");
    expect(migration).toContain("order by score_total desc, score_total_em asc nulls last, aluno_id asc");
  });
});
