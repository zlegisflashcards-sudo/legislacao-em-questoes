import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import fixture from "@/lib/LC68PI_CORRECOES_UUID_V1_NAO_IMPORTAR_NO_ANKI.fixture.json";

const state = vi.hoisted(() => ({ admin: true, rows: [] as Array<Record<string, unknown>>, operation: null as Record<string, unknown> | null, rpcCalls: 0 }));
vi.mock("@/lib/admin-auth", () => ({ obterAdministrador: async () => state.admin ? { id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" } : null }));
vi.mock("@/lib/supabase-server", () => ({ getSupabaseServerClient: () => ({
  from(table: string) {
    const query = {
      select() { return query; }, eq() { return query; },
      async maybeSingle() { return { data: table === "leis" ? { id: 1, slug: "lc68pi" } : state.operation, error: null }; },
      async in(_column: string, ids: string[]) { return { data: state.rows.filter((row) => ids.includes(String(row.id))).map((row) => ({ ...row })), error: null }; },
    };
    return query;
  },
  async rpc(_name: string, params: { p_operation_id: string; p_actor_id: string; p_law_id: number; p_patch_hash: string; p_updates: typeof fixture.updates }) {
    state.rpcCalls++;
    for (const item of params.p_updates) Object.assign(state.rows.find((row) => row.id === item.uuid)!, item.changes);
    const result = { operation_id: params.p_operation_id, changed_count: params.p_updates.length };
    state.operation = { actor_id: params.p_actor_id, law_id: params.p_law_id, patch_hash: params.p_patch_hash, result };
    return { data: result, error: null };
  },
}) }));
import { POST } from "./route";

const raw = JSON.stringify(fixture);
async function post(body: Record<string, unknown>) {
  const response = await POST(new Request("http://localhost/api/admin/questoes/patch-uuid", { method: "POST", body: JSON.stringify({ law_slug: "lc68pi", patch: raw, ...body }) }));
  return { status: response.status, body: await response.json() };
}
beforeEach(() => {
  state.admin = true; state.operation = null; state.rpcCalls = 0;
  state.rows = fixture.updates.map((item) => ({ id: item.uuid, lei_id: 1, ativo: true, ...item.expected_before, updated_at: "2026-01-01T00:00:00Z" }));
  process.env.SUPABASE_SERVICE_ROLE_KEY = "a".repeat(64);
  delete process.env.QUESTION_UUID_PATCH_APPLY_ENABLED;
});
afterEach(() => { delete process.env.SUPABASE_SERVICE_ROLE_KEY; delete process.env.QUESTION_UUID_PATCH_APPLY_ENABLED; });

describe("UUID patch API (isolated mocks)", () => {
  it("requires admin and keeps application disabled by default", async () => {
    state.admin = false; expect((await post({})).status).toBe(401); state.admin = true;
    const preview = await post({}); expect(preview.body.counts.aptos).toBe(79); expect(preview.body.apply_available).toBe(false);
    expect((await post({ action: "apply", confirmation: preview.body.confirmation })).status).toBe(503);
    expect(state.rpcCalls).toBe(0);
  });
  it("binds confirmation to the file and rejects changed data without writing", async () => {
    process.env.QUESTION_UUID_PATCH_APPLY_ENABLED = "true";
    const preview = await post({});
    expect((await post({ action: "apply", confirmation: preview.body.confirmation, patch: `${raw} ` })).status).toBe(409);
    state.rows[0].assunto = "edição posterior";
    expect((await post({ action: "apply", confirmation: preview.body.confirmation })).status).toBe(409);
    expect(state.rpcCalls).toBe(0);
    expect((await post({})).body.counts.conflitos).toBeGreaterThan(0);
  });
  it("applies once and recovers the recorded result on status or retry", async () => {
    process.env.QUESTION_UUID_PATCH_APPLY_ENABLED = "true";
    const preview = await post({});
    expect((await post({ action: "status", confirmation: preview.body.confirmation })).status).toBe(404);
    const applied = await post({ action: "apply", confirmation: preview.body.confirmation });
    expect(applied.status).toBe(200); expect(applied.body.verified).toBe(true);
    expect((await post({ action: "status", confirmation: preview.body.confirmation })).body.verified).toBe(true);
    expect((await post({ action: "apply", confirmation: preview.body.confirmation })).body.verified).toBe(true);
    expect(state.rpcCalls).toBe(1);
  });
});
