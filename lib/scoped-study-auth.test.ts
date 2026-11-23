import { describe, expect, it, vi } from "vitest";

const authenticate = vi.hoisted(() => vi.fn());
vi.mock("server-only", () => ({}));
vi.mock("@/lib/law-study-server", () => ({
  authenticateLawStudent: authenticate,
  LawStudyApiError: class extends Error { constructor(public status: number, message: string) { super(message); } },
}));
import { authorizeScopedStudy } from "./scoped-study-auth";

const id = "09948964-6c60-48ea-9045-1cd861ec8550";
const request = new Request(`https://example.test/test?recorte_id=${id}`);
const structures = [{ id: 1, parent_id: null }, { id: 2, parent_id: 1 }, { id: 3, parent_id: 1 }, { id: 4, parent_id: 2 }];
function prepare({ scope = "free", entitlement = "none" }: { scope?: "free" | "paid" | "missing"; entitlement?: "none" | "sibling" | "exact" | "full" } = {}) {
  const seen: Record<string, Record<string, unknown>> = {};
  const values: Record<string, unknown> = {
    recortes_leis: scope === "missing" ? null : { id, nome: "Amostra", acesso_gratuito: scope === "free" },
    liberacoes_leis: entitlement === "none" ? [] : [{ produto_id: entitlement === "full" ? null : "product" }],
    produto_leis: [{ produto_id: "product", recorte_id: entitlement === "exact" ? id : "wrong-scope" }],
    recortes_leis_estrutura: [{ structure_id: 2 }, { structure_id: 100 }],
    law_structure: structures,
  };
  authenticate.mockResolvedValue({ law: { acesso_gratuito: false }, lawId: 9, studentId: "student", supabase: { from(table: string) {
    const filters = seen[table] = {} as Record<string, unknown>;
    const result = { error: null, data: values[table] };
    const query = {
      select() { return query; }, eq(key: string, value: unknown) { filters[key] = value; return query; },
      in(key: string, value: unknown) { filters[key] = value; return query; },
      order() { return query; }, range() { return Promise.resolve(result); },
      maybeSingle() { return Promise.resolve(result); },
      then(callback: (response: typeof result) => unknown) { return Promise.resolve(result).then(callback); },
    };
    return query;
  } } });
  return seen;
}

describe("autorização da leitura e áudio em recorte", () => {
  it("propaga 401 antes de ler qualquer dado", async () => {
    const seen = prepare();
    authenticate.mockRejectedValueOnce({ status: 401 });
    await expect(authorizeScopedStudy(request, "cf", id)).rejects.toMatchObject({ status: 401 });
    expect(seen).toEqual({});
  });
  it("exige lei, publicação e ativo no servidor; não inclui irmãos, pais ou nós inexistentes", async () => {
    const seen = prepare();
    const result = await authorizeScopedStudy(request, "cf", id);
    expect(seen.recortes_leis).toEqual({ lei_id: 9, id, ativo: true, status_publicacao: "ativa" });
    expect(seen.recortes_leis_estrutura).toEqual({ lei_id: 9, recorte_id: id });
    expect(seen.liberacoes_leis).toBeUndefined();
    expect(result.structureIds).toEqual([2, 4]);
  });
  it.each(["none", "sibling"] as const)("não abre recorte pago com liberação %s", async (entitlement) => {
    const seen = prepare({ scope: "paid", entitlement });
    await expect(authorizeScopedStudy(request, "cf", id)).rejects.toMatchObject({ status: 403 });
    expect(seen.law_structure).toBeUndefined();
  });
  it.each(["exact", "full"] as const)("honra compra %s sem ampliar o conteúdo solicitado", async (entitlement) => {
    prepare({ scope: "paid", entitlement });
    await expect(authorizeScopedStudy(request, "cf", id)).resolves.toMatchObject({ structureIds: [2, 4] });
  });
  it("nega recorte inativo, não publicado ou de outra lei quando não está na consulta restrita", async () => {
    prepare({ scope: "missing" });
    await expect(authorizeScopedStudy(request, "cf", id)).rejects.toMatchObject({ status: 403 });
  });
});
