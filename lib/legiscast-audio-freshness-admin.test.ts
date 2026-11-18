import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync("supabase/migrations/20261118103000_add_legiscast_audio_freshness_control.sql", "utf8");
const server = readFileSync("lib/admin-legiscast-audios-server.ts", "utf8");
const route = readFileSync("app/api/admin/legiscast-audios/route.ts", "utf8");
const client = readFileSync("components/admin/legiscast-audios-admin.tsx", "utf8");

describe("controle editorial de desatualização do LegisCast", () => {
  it("persiste a decisão sem desativar ou excluir a faixa", () => {
    for (const field of [
      "situacao_atualizacao_manual",
      "situacao_atualizacao_em",
      "situacao_atualizacao_motivo",
      "situacao_atualizacao_alteracao_referencia",
      "situacao_atualizacao_alteracao_data",
    ]) expect(migration).toContain(field);
    expect(migration).toContain("p_action not in ('mark_outdated', 'mark_current', 'clear')");
    expect(migration).toContain("marcar_legiscast_desatualizado");
    expect(migration).toContain("confirmar_legiscast_atualizado");
    expect(migration).toContain("estado_anterior, estado_posterior");
  });

  it("restringe a operação ao servidor administrativo e explica quando a migration falta", () => {
    expect(migration).toContain("revoke all on function public.admin_set_legiscast_audio_freshness");
    expect(migration).toContain("to service_role");
    expect(server).toContain("updateAdminLegiscastAudioFreshness");
    expect(server).toContain("A migration correspondente precisa ser aplicada");
    expect(route).toContain('body.operation === "update-freshness"');
  });

  it("mostra inclusão, publicação e alteração legislativa antes da confirmação", () => {
    expect(client).toContain("Marcar áudio como desatualizado");
    expect(client).toContain("Incluído em");
    expect(client).toContain("Última alteração incorporada");
    expect(client).toContain("Usar cálculo automático");
    expect(client).toContain('operation: "update-freshness"');
  });

  it("mantém o acervo carregando enquanto o ambiente ainda não aplicou a migration", () => {
    expect(server).toContain("isMissingLegiscastFreshnessSchema");
    expect(server).toContain("audioRequest(false)");
    expect(server).toContain("situacao_atualizacao_manual");
  });

  it("considera a alteração efetiva do texto do bloco na mesma estrutura ou cobertura", () => {
    expect(server).toContain('select("lei_id,structure_id,legislacao_atualizada_em")');
    expect(server).toContain("blockFreshnessAvailable");
    expect(client).toContain("blockChanges");
    expect(client).toContain("audioBlockChange");
    expect(client).toContain("bloco alterado em");
  });
});
