import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync("supabase/migrations/20260811120000_add_student_access_activity.sql", "utf8");
const account = readFileSync("components/student-account.tsx", "utf8");
const endpoint = readFileSync("app/api/aluno/acesso/route.ts", "utf8");
const commercial = readFileSync("lib/commercial-admin-server.ts", "utf8");
const panel = readFileSync("components/admin/commercial-admin.tsx", "utf8");

describe("acompanhamento de acesso dos alunos", () => {
  it("persiste primeiro e último acesso com incremento atômico somente pelo user_id", () => {
    expect(migration).toContain("primeiro_acesso_em timestamptz");
    expect(migration).toContain("ultimo_acesso_em timestamptz");
    expect(migration).toContain("total_logins integer not null default 0");
    expect(migration).toContain("primeiro_acesso_em = coalesce(primeiro_acesso_em");
    expect(migration).toContain("total_logins = coalesce(total_logins, 0) + 1");
    expect(migration).toContain("where user_id = p_user_id");
    expect(migration).toContain("alunos_ultimo_acesso_em_idx");
  });

  it("registra somente após sessão autenticada e não durante carregamento ou vínculo", () => {
    expect(account).toContain('fetch("/api/aluno/acesso", { method: "POST"');
    expect(account.indexOf("await registrarAcesso();")).toBeGreaterThan(account.indexOf("signInWithPassword"));
    expect(account.indexOf("await registrarAcesso();")).toBeGreaterThan(account.indexOf("await vincularAluno();"));
    expect(endpoint).toContain("supabase.auth.getUser(token)");
    expect(endpoint).toContain('rpc("registrar_acesso_aluno"');
    expect(account.slice(account.indexOf("useEffect"), account.indexOf("async function vincularAluno"))).not.toContain('fetch("/api/aluno/acesso"');
  });

  it("executa filtros e contadores no backend junto da paginação", () => {
    for (const filter of ["entrou_hoje", "ultimos_7_dias", "ultimos_30_dias", "nunca_entrou"]) expect(commercial).toContain(`"${filter}"`);
    expect(commercial).toContain('rpc("admin_resumo_acessos_alunos")');
    expect(migration).toContain("ultimo_acesso_em >= current_date");
    expect(migration).toContain("interval '7 days'");
    expect(migration).toContain("interval '30 days'");
    expect(migration).toContain("ultimo_acesso_em is null");
  });

  it("exibe atividade amigável, detalhes disponíveis e indicadores na aba Alunos", () => {
    expect(panel).toContain("Nunca entrou");
    expect(panel).toContain("Hoje,");
    expect(panel).toContain("Ontem,");
    expect(panel).toContain("Acompanhamento de acesso");
    expect(panel).toContain("Entraram hoje:");
    expect(panel).toContain("Últimos 7 dias:");
    expect(panel).toContain("Nunca entraram:");
    expect(panel).toContain('headers={["Aluno", "Primeiro acesso", "Último acesso", "Logins"]}');
    expect(panel).toContain("primeiro_acesso_em");
    expect(panel).toContain("total_logins");
  });
});
