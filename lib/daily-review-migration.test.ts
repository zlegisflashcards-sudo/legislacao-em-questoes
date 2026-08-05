import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync("supabase/migrations/20260804223000_create_daily_review_streak.sql", "utf8");

describe("migration da revisão diária", () => {
  it("é idempotente e impede duplicidade diária", () => {
    expect(migration).toContain("create table if not exists public.registros_revisao_diaria");
    expect(migration).toContain("create unique index if not exists registros_revisao_diaria_usuario_data_unique");
    expect(migration).toContain("on conflict do nothing");
  });

  it("usa identidade e data determinadas pelo servidor", () => {
    expect(migration).toContain("v_user_id uuid := auth.uid()");
    expect(migration).toContain("America/Sao_Paulo");
    expect(migration).not.toMatch(/registrar_revisao_diaria\s*\([^)]*user_id/i);
  });

  it("nega acesso anônimo e escrita direta autenticada", () => {
    expect(migration).toContain("enable row level security");
    expect(migration).toContain("revoke all on table public.registros_revisao_diaria from public, anon, authenticated");
    expect(migration).toContain("grant select on table public.registros_revisao_diaria to authenticated");
    expect(migration).toContain("grant all on table public.registros_revisao_diaria to service_role");
    expect(migration).not.toContain("grant insert on table public.registros_revisao_diaria to authenticated");
  });

  it("calcula sequência persistida e expõe RPCs somente aos papéis autorizados", () => {
    expect(migration).toContain("public.calcular_streak_revisao");
    expect(migration).toContain("public.obter_sequencia_revisao()");
    expect(migration).toContain("public.registrar_revisao_diaria()");
    expect(migration).toContain("grant execute on function public.registrar_revisao_diaria() to authenticated, service_role");
  });

  it("restringe o search_path de todas as funções SECURITY DEFINER", () => {
    expect(migration.match(/security definer/g)).toHaveLength(3);
    expect(migration.match(/set search_path = pg_catalog/g)).toHaveLength(3);
    expect(migration).not.toContain("set search_path = public");
    expect(migration).not.toContain("pg_temp");
    expect(migration).toContain("auth.uid()");
    expect(migration).toContain("public.registros_revisao_diaria");
    expect(migration).toContain("public.calcular_streak_revisao");
  });
});
