import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({ authenticate: vi.fn(), from: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/law-study-server", () => ({
  authenticateLawStudent: db.authenticate,
  LawStudyApiError: class ApiError extends Error {
    constructor(public status: number, message: string) { super(message); }
  },
  lawStudyErrorResponse: (error: { status?: number; message: string }) => Response.json({ message: error.message }, { status: error.status ?? 500 }),
}));
vi.mock("./cpp-pmal-reading-review", async () => {
  const { createHash } = await import("node:crypto");
  const sha = (v: string) => createHash("sha256").update(v).digest("hex");
  return { parseCppPmalReview: () => [["a", 608, "4", "Art. 4", sha("<p>Inquérito</p>")], ["b", 609, "24", "Art. 24", sha("<p>Ação penal</p>")]] };
});

import { GET } from "../../app/api/legisbot/[slug]/pmal-reading/route";
import { CPP_PMAL_SCOPE_ID, cppPmalReadingHasEntitlement, isCppPmalReading } from "./cpp-pmal-reading-policy";

const url = "https://site.invalid/api/legisbot/cpp/pmal-reading";
const request = (scope = CPP_PMAL_SCOPE_ID) => new Request(`${url}?recorte_id=${scope}`);
const params = { params: Promise.resolve({ slug: "cpp" }) };
const row = { id: "a", structure_id: 608, ordem: "4", identificacao: "Art. 4", legislacao: "<p>Inquérito</p>", preparado_em: "ok", situacao: "ativa" };
const rowB = { ...row, id: "b", structure_id: 609, ordem: "24", identificacao: "Art. 24", legislacao: "<p>Ação penal</p>" };
let state: Record<string, unknown>;
let filters: Record<string, unknown[][]>;
beforeEach(() => {
  vi.clearAllMocks();
  filters = {};
  state = {
    recortes_leis: { id: CPP_PMAL_SCOPE_ID },
    liberacoes_leis: [{ produto_id: "pmal" }],
    produto_leis: [{ produto_id: "pmal", recorte_id: CPP_PMAL_SCOPE_ID }],
    produtos: [{ id: "pmal" }],
    recortes_leis_estrutura: [{ structure_id: 608 }, { structure_id: 609 }],
    law_structure: [{ id: 608 }, { id: 609 }],
    legislative_references: [rowB, row],
  };
  db.authenticate.mockResolvedValue({ supabase: { from: db.from }, lawId: 61, studentId: "aluno" });
  db.from.mockImplementation((table: string) => {
    const result = { data: state[table], error: null };
    const builder = Object.assign(Promise.resolve(result), { maybeSingle: () => Promise.resolve(result) });
    for (const method of ["select", "eq", "in", "or", "limit"] as const) Object.assign(builder, { [method]: (...args: unknown[]) => {
      (filters[table] ??= []).push([method, ...args]);
      return builder;
    }});
    return builder;
  });
});

describe("CPP: leitura publicada só no recorte PMAL", () => {
  it("delivers exclusively the reviewed titles to a matching purchase", async () => {
    const response = await GET(request(), params);
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect((await response.json()).blocks).toEqual([
      { id: "a", structureId: 608, label: "Art. 4", html: "<p>Inquérito</p>" },
      { id: "b", structureId: 609, label: "Art. 24", html: "<p>Ação penal</p>" },
    ]);
    expect(filters.legislative_references).toContainEqual(["eq", "lei_id", 61]);
    expect(filters.legislative_references).toContainEqual(["in", "structure_id", [608, 609]]);
    expect(filters.recortes_leis).toContainEqual(["eq", "status_publicacao", "ativa"]);
  });
  it.each([{ grants: [] }, { grants: [{ produto_id: "other" }] }])("denies a non-entitled release %j before loading blocks", async ({ grants }) => {
    state.liberacoes_leis = grants;
    const response = await GET(request(), params);
    expect(response.status).toBe(403);
    expect(db.from).not.toHaveBeenCalledWith("legislative_references");
  });
  it("rejects inactive products and unpublished scopes", async () => {
    state.produtos = [];
    expect((await GET(request(), params)).status).toBe(403);
    state.recortes_leis = null;
    expect((await GET(request(), params)).status).toBe(404);
    expect(db.from).not.toHaveBeenCalledWith("legislative_references");
  });
  it("accepts real whole-law entitlement without treating a different recorte as whole-law", () => {
    expect(cppPmalReadingHasEntitlement([{ produto_id: null }], [], [])).toBe(true);
    expect(cppPmalReadingHasEntitlement([{ produto_id: "one" }], [{ produto_id: "one", recorte_id: null }], ["one"])).toBe(true);
    expect(cppPmalReadingHasEntitlement([{ produto_id: "one" }], [{ produto_id: "one", recorte_id: "sibling" }], ["one"])).toBe(false);
  });
  it("fails closed when scope, structure, or reviewed bytes change", async () => {
    state.recortes_leis_estrutura = [{ structure_id: 607 }, { structure_id: 608 }, { structure_id: 609 }];
    expect((await GET(request(), params)).status).toBe(409);
    expect(db.from).not.toHaveBeenCalledWith("legislative_references");
    state.recortes_leis_estrutura = [{ structure_id: 608 }, { structure_id: 609 }];
    for (const candidate of [{ ...row, structure_id: 607 }, { ...row, legislacao: "<p>Outro artigo</p>" }, { ...row, preparado_em: null }, { ...row, situacao: "arquivada" }]) {
      const bad = await (async () => { state.legislative_references = [candidate, rowB]; return GET(request(), params); })();
      expect(bad.status).toBe(409);
      expect((await bad.json()).blocks).toBeUndefined();
    }
    state.legislative_references = [row];
    expect((await GET(request(), params)).status).toBe(409);
  });
  it("does not authorize duplicate scope params, wrong laws or a parked scope", async () => {
    expect((await GET(new Request(`${url}?recorte_id=${CPP_PMAL_SCOPE_ID}&recorte_id=foo`), params)).status).toBe(400);
    expect((await GET(request(), { params: Promise.resolve({ slug: "cp" }) })).status).toBe(404);
    expect((await GET(request("other"), params)).status).toBe(404);
    expect(db.authenticate).not.toHaveBeenCalled();
    expect(isCppPmalReading("cpp", undefined)).toBe(false);
    expect(isCppPmalReading("cpp", [CPP_PMAL_SCOPE_ID])).toBe(false);
  });
});
