import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync("supabase/migrations/20260827120000_campaign_score_phase1.sql", "utf8");
const levelScoreMigration = readFileSync("supabase/migrations/20260827130000_add_campaign_level_competitive_score.sql", "utf8");

describe("transição da pontuação competitiva V2", () => {
  it("migra somente campanhas legadas em andamento e preserva os dados pedagógicos", () => {
    const transition = migration.slice(0, migration.indexOf("create or replace function public.registrar_resposta_campanha"));
    expect(migration).toContain("where score_version=1 and not concluida");
    expect(migration).toContain("score_version=2, score=0, score_competitivo_acertos=0, score_competitivo_erros=0");
    expect(transition).not.toContain("update public.campanhas_leis_niveis");
    expect(transition).not.toContain("update public.progresso_leis_alunos");
  });

  it("é idempotente: V2 não satisfaz o predicado de inicialização", () => {
    expect(migration).toContain("where score_version=1 and not concluida");
  });

  it("separa os contadores competitivos de total_erros pedagógico", () => {
    expect(migration).toContain("score_competitivo_acertos");
    expect(migration).toContain("score_competitivo_erros");
    expect(migration).toContain("total_erros=p_total_erros_nivel");
    expect(migration).toContain("score_competitivo_erros=score_competitivo_erros+");
  });

  it("mantém o ranking exclusivamente na versão 2, inclusive em andamento", () => {
    expect(migration).toContain("where lei_id=p_lei_id and score_version=2");
    expect(migration).not.toContain("score_version=2 and concluida");
    expect(migration).toContain("score_competitivo_atualizado_em asc");
  });

  it("persiste a parcial competitiva por nível sem reutilizar total_erros pedagógico", () => {
    expect(levelScoreMigration).toContain("add column if not exists score_competitivo_acertos integer not null default 0");
    expect(levelScoreMigration).toContain("add column if not exists score_competitivo_erros integer not null default 0");
    expect(levelScoreMigration).toContain("total_erros=p_total_erros_nivel");
    expect(levelScoreMigration).toContain("score_competitivo_acertos=n.score_competitivo_acertos+case when p_correta then 1 else 0 end");
    expect(levelScoreMigration).toContain("score_competitivo_erros=n.score_competitivo_erros+case when p_correta then 0 else 1 end");
  });

  it("preserva os aliases da RPC para não reintroduzir a ambiguidade 42702", () => {
    expect(levelScoreMigration).toContain("update public.campanhas_leis_alunos as c");
    expect(levelScoreMigration).toContain("c.score_competitivo_acertos");
    expect(levelScoreMigration).toContain("c.score_competitivo_erros");
    expect(levelScoreMigration).toContain("c.score is distinct from");
    expect(levelScoreMigration).toContain("returning c.score_competitivo_acertos,c.score_competitivo_erros,c.score");
  });
});
