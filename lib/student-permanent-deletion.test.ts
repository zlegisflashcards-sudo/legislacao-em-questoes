import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync("supabase/migrations/20260810170000_add_admin_permanent_student_deletion.sql", "utf8");
const server = readFileSync("lib/commercial-admin-server.ts", "utf8");
const ui = readFileSync("components/admin/commercial-admin.tsx", "utf8");

describe("exclusão administrativa definitiva de aluno", () => {
  it("exige confirmação forte e mantém a operação no endpoint administrativo", () => {
    expect(ui).toContain("Digite <strong>EXCLUIR</strong>");
    expect(server).toContain('action === "excluir_definitivamente"');
    expect(server).toContain('confirmation !== "EXCLUIR"');
    expect(migration).toContain("Digite EXCLUIR para confirmar");
  });

  it("remove explicitamente os vínculos operacionais em uma única RPC", () => {
    expect(migration).toContain("delete from public.alunos_primeiro_acesso_envios");
    expect(migration).toContain("delete from public.liberacoes_leis");
    expect(migration).toContain("delete from public.aluno_produtos");
    expect(migration).toContain("delete from public.progresso_leis_alunos");
    expect(migration).toContain("delete from public.alunos where id=a.id");
    expect(migration).toContain("Referencia pendente nao suportada");
  });

  it("reconhece aluno_produtos pelo OID da FK e preserva o bloqueio para relações desconhecidas", () => {
    const preflightFix = readFileSync("supabase/migrations/20260810180000_fix_student_deletion_supported_fk_preflight.sql", "utf8");
    expect(preflightFix).toContain("'public.aluno_produtos'::regclass");
    expect(preflightFix).toContain("and conrelid not in");
    expect(preflightFix).toContain("delete from public.aluno_produtos where aluno_id=a.id");
    expect(preflightFix).toContain("Referencia pendente nao suportada");
  });

  it("preserva compras e rastreabilidade Hotmart sem FK órfã", () => {
    expect(migration).toContain("alter column aluno_id drop not null");
    expect(migration).toContain("on delete set null");
    expect(migration).toContain("update public.compras set aluno_id=null");
    expect(migration).toContain("hotmart_eventos_preservados',true");
  });

  it("remove Auth somente no servidor e não altera o banco se essa etapa falhar", () => {
    expect(server).toContain("supabase.auth.admin.deleteUser");
    expect(server).toContain("nenhum dado do aluno foi alterado");
    expect(server.indexOf("supabase.auth.admin.deleteUser")).toBeLessThan(server.indexOf('rpc("admin_excluir_aluno_definitivamente"'));
  });

  it("mostra resumo, alerta de duplicidade e cancelamento antes da exclusão", () => {
    expect(server).toContain('action === "resumo_exclusao"');
    expect(ui).toContain("Possível cadastro duplicado");
    expect(ui).toContain("Compras/aquisições:");
    expect(ui).toContain("Excluir definitivamente");
    expect(ui).toContain("Cancelar");
  });

  it("registra a falha técnica com segurança e devolve uma causa administrativa", () => {
    expect(server).toContain("Falha na exclusão administrativa de aluno");
    expect(server).toContain("etapa: name === \"admin_resumo_exclusao_aluno\" ? \"preflight\" : \"transacao_banco\"");
    expect(server).toContain("Não foi possível excluir: a rotina de banco necessária ainda não está disponível.");
    expect(server).toContain("existe vínculo pendente ou referência não suportada");
    expect(server).not.toMatch(/console\.(?:info|error)\([^\n]*(?:senha|password|service_role)/i);
  });

  it("audita o UUID e o resumo da remoção, sem segredos", () => {
    expect(migration).toContain("'excluir_definitivamente','aluno',a.id::text");
    expect(migration).toContain("compras_desvinculadas_e_preservadas");
    expect(migration).not.toMatch(/senha|password/i);
  });
});
