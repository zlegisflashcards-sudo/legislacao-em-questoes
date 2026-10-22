import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const originalMigration = readFileSync(
  "supabase/migrations/20260711150000_create_legisbot_comentarios.sql",
  "utf8",
);
const serverOnlyMigration = readFileSync(
  "supabase/migrations/20260929120000_track_legisbot_source_revision.sql",
  "utf8",
);
const compatibilityMigration = readFileSync(
  "supabase/migrations/20261022130000_grant_legisbot_comment_api_access.sql",
  "utf8",
);
const repository = readFileSync("lib/legisbot/generation-repository.ts", "utf8");
const generationRoute = readFileSync(
  "app/api/legisbot/[slug]/[ordem]/generate/route.ts",
  "utf8",
);
const legacyClientService = readFileSync("lib/legisbot-comentarios-service.ts", "utf8");

describe("privilégios SQL da Data API para o LegisBot", () => {
  it("mantém a escrita pública revogada e concede ao service role somente os verbos diretos", () => {
    expect(originalMigration).toContain("enable row level security");
    expect(originalMigration).toContain("to anon, authenticated");
    expect(originalMigration).toContain("for select");
    expect(originalMigration).toContain("for insert");
    expect(originalMigration).toContain('with check (');
    expect(serverOnlyMigration).toContain(
      "revoke insert, update, delete on public.legisbot_comentarios from anon, authenticated;",
    );
    expect(serverOnlyMigration).toContain("Novas solicitações passam exclusivamente pela API autenticada");
    expect(compatibilityMigration).toContain(
      "grant select, update on table public.legisbot_comentarios to service_role;",
    );
    expect(compatibilityMigration).not.toMatch(/anon|authenticated|\b(?:insert|delete|all)\b/i);
  });

  it("amarra o grant ao caminho server-side ativo, não ao módulo legado", () => {
    expect(generationRoute).toContain("getSupabaseServerClient()");
    expect(repository).toContain(".select(\"*\")");
    expect(repository).toContain(".update({");
    expect(repository).toContain('rpc("reservar_geracao_legisbot"');
    expect(legacyClientService).toContain(".insert(solicitacao)");
  });
});

