import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ authUpdated: false, flagCleared: false }));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase-server", () => ({
  getSupabaseServerClient: () => ({
    auth: {
      getUser: async () => ({ data: { user: { id: "00000000-0000-4000-8000-000000000001" } }, error: null }),
      admin: {
        updateUserById: async () => {
          state.authUpdated = true;
          return { error: null };
        },
      },
    },
    from: () => ({
      update: () => ({
        eq: () => ({
          eq: async () => {
            state.flagCleared = true;
            return { error: null };
          },
        }),
      }),
    }),
  }),
}));

import { POST } from "./route";

describe("POST /api/aluno/acesso-provisorio", () => {
  beforeEach(() => { state.authUpdated = false; state.flagCleared = false; });

  it("não remove a obrigação por chamada direta sem uma nova senha", async () => {
    const response = await POST(new Request("https://legisflashcards.local/api/aluno/acesso-provisorio", {
      method: "POST",
      headers: { Authorization: "Bearer sessao-descartavel", "Content-Type": "application/json" },
      body: JSON.stringify({}),
    }));
    expect(response.status).toBe(400);
    expect(state.authUpdated).toBe(false);
    expect(state.flagCleared).toBe(false);
  });

  it("altera o Auth antes de remover a obrigação", async () => {
    const response = await POST(new Request("https://legisflashcards.local/api/aluno/acesso-provisorio", {
      method: "POST",
      headers: { Authorization: "Bearer sessao-descartavel", "Content-Type": "application/json" },
      body: JSON.stringify({ password: "NovaSenhaSegura1!" }),
    }));
    expect(response.status).toBe(200);
    expect(state.authUpdated).toBe(true);
    expect(state.flagCleared).toBe(true);
  });
});
