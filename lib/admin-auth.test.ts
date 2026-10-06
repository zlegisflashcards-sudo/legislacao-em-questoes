import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  getUser: vi.fn(),
  refreshSession: vi.fn(),
  store: {
    get: vi.fn(),
    set: vi.fn(),
  },
}));

vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ cookies: vi.fn(async () => state.store) }));
vi.mock("@supabase/supabase-js", () => ({
  createClient: vi.fn(() => ({ auth: { getUser: state.getUser, refreshSession: state.refreshSession } })),
}));

import { obterAdministrador } from "./admin-auth";

describe("obterAdministrador", () => {
  beforeEach(() => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon";
    state.getUser.mockReset();
    state.refreshSession.mockReset();
    state.store.get.mockReset();
    state.store.set.mockReset();
  });

  it("renova a sessão quando o cookie curto já expirou, mas o refresh ainda existe", async () => {
    state.store.get.mockImplementation((name: string) => name === "legisbot_admin_refresh" ? { value: "refresh-token" } : undefined);
    state.refreshSession.mockResolvedValue({
      error: null,
      data: {
        user: { id: "admin", email: "admin@example.com", app_metadata: { admin: true } },
        session: { access_token: "next-access", refresh_token: "next-refresh", expires_in: 3600 },
      },
    });

    await expect(obterAdministrador()).resolves.toMatchObject({ id: "admin" });
    expect(state.getUser).not.toHaveBeenCalled();
    expect(state.refreshSession).toHaveBeenCalledWith({ refresh_token: "refresh-token" });
    expect(state.store.set).toHaveBeenCalledWith("legisbot_admin_access", "next-access", expect.objectContaining({ maxAge: 3600 }));
    expect(state.store.set).toHaveBeenCalledWith("legisbot_admin_refresh", "next-refresh", expect.objectContaining({ maxAge: 60 * 60 * 24 * 365 }));
  });
});
