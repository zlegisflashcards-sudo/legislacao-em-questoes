import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync("supabase/migrations/20260808230000_enforce_student_email_identity.sql", "utf8");
const consolidation = readFileSync("supabase/IDENTITY_CONSOLIDATION_NEXT_STEP.md", "utf8");
const account = readFileSync("components/student-account.tsx", "utf8");
const link = readFileSync("app/api/aluno/vincular/route.ts", "utf8");
const imports = readFileSync("lib/commercial-admin-server.ts", "utf8");
const webhook = readFileSync("lib/hotmart/webhook.ts", "utf8");

describe("identidade de aluno por e-mail normalizado", () => {
  it("normaliza lower(btrim(email)) e bloqueia insercoes e atualizacoes duplicadas", () => {
    expect(migration).toContain("lower(pg_catalog.btrim(p_email))");
    expect(migration).toContain("before insert or update of email on public.alunos");
    expect(migration).toContain("errcode = '23505'");
  });

  it("serializa cadastro, Auth e aquisicoes concorrentes pelo mesmo e-mail", () => {
    expect(migration.match(/pg_advisory_xact_lock/g)?.length).toBeGreaterThanOrEqual(3);
    expect(migration).toContain("obter_ou_criar_aluno_por_email");
    expect(migration).toContain("vincular_aluno_para_usuario");
  });

  it("mantem o aluno sem Auth e o vincula quando a conta e criada", () => {
    expect(migration).toContain("user_id is null");
    expect(migration).toContain("return 'linked'");
    expect(link).toContain("vincular_aluno_para_usuario");
    expect(account).toContain("auth.signUp");
    expect(account).toContain("resetPasswordForEmail");
    expect(account).toContain("updateUser({ password })");
  });

  it("faz importacao e webhook reutilizarem identidade atomica e preserva idempotencia de compra", () => {
    expect(imports).toContain('rpc("admin_importar_aquisicao_hotmart_historica"');
    expect(webhook).toContain('rpc("obter_ou_criar_aluno_por_email"');
    expect(imports).toContain('eq("identificador_externo", sale.transactionId)');
    expect(webhook).toContain('eq("identificador_externo", evento.codigo_transacao)');
  });

  it("adia apenas a constraint UNIQUE ate a consolidacao explicita dos duplicados legados", () => {
    expect(migration).toContain("alunos_email_normalizado_idx");
    expect(migration).not.toContain("create unique index alunos_email_normalizado_unique_idx");
    expect(consolidation).toContain("create unique index alunos_email_normalizado_unique_idx");
  });
});
