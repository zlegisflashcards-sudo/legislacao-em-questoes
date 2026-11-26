import { createHash } from "node:crypto";
import { NextRequest } from "next/server";
import { describe, expect, it, vi } from "vitest";
import { buildReviewedReading } from "@/lib/legisbot/tjsp-reviewed-reading-core";

const fixtures = vi.hoisted(() => ({ scope: vi.fn(), db: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/admin-auth", () => ({ obterAdministrador: async () => null, exigirAdministrador: vi.fn() }));
vi.mock("@/lib/law-study-server", () => ({ lawStudyErrorResponse: () => new Response(null, { status: 500 }) }));
vi.mock("@/lib/legisbot/interactive-reading-access", () => ({ authorizeIntegralInteractiveReading: vi.fn() }));
vi.mock("@/lib/legisbot/scoped-interactive-reading-server", () => ({ loadScopedInteractiveReading: fixtures.scope }));
vi.mock("@/lib/supabase-server", () => ({ getSupabaseServerClient: fixtures.db }));

import { GET as reading } from "@/app/api/legisbot/[slug]/reading/route";
import { GET as references } from "@/app/api/legisbot/[slug]/references/route";

const allowed = "00000000-0000-4000-8000-000000000088";
const disallowed = "00000000-0000-4000-8000-000000000090";
const context = { params: Promise.resolve({ slug: "l9099" }) };
const request = (path: string) => new NextRequest(`https://example.test/${path}`);
const law = { id: 27, slug: "l9099", titulo: "Lei 9.099", nome_curto: "Lei 9.099", codigo: "l9099" };
const html = "<p>Art. 88. Texto conferido.</p>";
const model = buildReviewedReading({
  law, manifest: [[allowed, "0088.0.00.0.00.0", 977, createHash("sha256").update(html).digest("hex")]],
  rows: [{ id: allowed, ordem: "0088.0.00.0.00.0", identificacao: "Art. 88", structure_id: 977, legislacao: html, preparado_em: "2026-11-26", situacao: null }],
  nodes: [{ id: 977, nome: "Seção 06", ordem: 6, tipo: "secao", parent_id: null }],
  selected: new Set([977]), blocked: new Set(),
});

describe("rotas da Lei Interativa respeitam a edição conferida", () => {
  it("envia o catálogo e primeiro lote apenas dos artigos da edição conferida", async () => {
    fixtures.scope.mockResolvedValue(model);
    const response = await reading(request("reading?recorte_id=scope"), context);
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toContain("no-store");
    const body = await response.json();
    expect(body.model.references.map((item: { id: string }) => item.id)).toEqual([allowed]);
    expect(body.initialBlocks[0].legislation).toBe(html);
    expect(body.model).not.toHaveProperty("reviewedBlockTexts");
    expect(fixtures.db).not.toHaveBeenCalled();
  });
  it("não entrega conteúdo externo nem relê texto não conferido ao paginar", async () => {
    fixtures.scope.mockResolvedValue(model);
    const response = await references(request(`references?recorte_id=scope&reference_ids=${disallowed},${allowed}`), context);
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(await response.json()).toEqual({ blocks: [{ id: allowed, legislation: html }] });
    expect(fixtures.db).not.toHaveBeenCalled();
  });
});
