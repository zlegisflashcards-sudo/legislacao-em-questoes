import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const fixtures = vi.hoisted(() => ({ auth: vi.fn(), model: vi.fn(), blocks: vi.fn(), ready: vi.fn() }));
vi.mock("@/lib/law-study-server", () => ({ lawStudyErrorResponse: () => new Response(null, { status: 500 }) }));
vi.mock("@/lib/legisbot/scoped-interactive-reading-server", () => ({ loadScopedInteractiveReading: async () => null }));
vi.mock("@/lib/admin-auth", () => ({ obterAdministrador: async () => null }));
vi.mock("@/lib/legisbot/interactive-reading-access", () => ({ authorizeIntegralInteractiveReading: fixtures.auth }));
vi.mock("@/lib/legisbot/continuous-reading-server", () => ({
  getContinuousReadingModel: fixtures.model,
  getContinuousReadingBlockTextsForLaw: fixtures.blocks,
  getContinuousReadingStructureReadiness: fixtures.ready,
}));

import { GET as reading } from "@/app/api/legisbot/[slug]/reading/route";
import { GET as references } from "@/app/api/legisbot/[slug]/references/route";

const ctx = { params: Promise.resolve({ slug: "cpp" }) };
const request = (path: string) => new NextRequest(`https://example.test/${path}`);

describe("pausa segura da Lei Interativa por recorte", () => {
  beforeEach(() => { vi.clearAllMocks(); });
  it.each(["recorte_id=scope", "recorte_id=", "recorte_id=a&recorte_id=b"])("não carrega o catálogo para %s", async (query) => {
    const response = await reading(request(`reading?${query}`), ctx);
    expect(response.status).toBe(409);
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(fixtures.model).not.toHaveBeenCalled();
  });
  it("não carrega HTML em uma página do recorte", async () => {
    const response = await references(request("references?recorte_id=scope&reference_ids=some-reference"), ctx);
    expect(response.status).toBe(409);
    expect(fixtures.blocks).not.toHaveBeenCalled();
  });
  it("mantém a verificação da leitura integral sem recorte", async () => {
    fixtures.auth.mockResolvedValueOnce({});
    fixtures.ready.mockResolvedValueOnce({ ready: true });
    fixtures.blocks.mockResolvedValueOnce([{ id: "only", legislation: "Texto da lei integral" }]);
    const response = await references(request("references?reference_ids=only"), ctx);
    expect(response.status).toBe(200);
    expect(fixtures.auth).toHaveBeenCalledOnce();
    expect(await response.json()).toEqual({ blocks: [{ id: "only", legislation: "Texto da lei integral" }] });
  });
});
