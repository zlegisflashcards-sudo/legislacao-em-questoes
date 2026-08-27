import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync("supabase/migrations/20260827120000_campaign_score_phase1.sql", "utf8");

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
});
