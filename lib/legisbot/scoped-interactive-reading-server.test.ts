import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const fixtures = vi.hoisted(() => ({ auth: vi.fn(), model: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/law-study-server", () => ({
  authenticateLawStudent: fixtures.auth,
  LawStudyApiError: class extends Error { constructor(public status: number, message: string) { super(message); } },
}));
vi.mock("./continuous-reading-server", () => ({ getScopedContinuousReadingModel: fixtures.model }));

import { loadScopedInteractiveReading } from "./scoped-interactive-reading-server";

const id = "00000000-0000-4000-8000-000000000001";
const other = "00000000-0000-4000-8000-000000000002";
const url = new URL(`https://example.test/api/reading?recorte_id=${id}`);
const read = (query = url.searchParams) => loadScopedInteractiveReading(new Request(url), "test-law", query);
function database(recorte: string, free = false) {
  const data: Record<string, unknown> = {
    recortes_leis: { id, acesso_gratuito: free },
    liberacoes_leis: [{ produto_id: "combo" }],
    recortes_leis_estrutura: [{ structure_id: 12 }, { structure_id: 19 }],
    produto_leis: [{ produto_id: "combo", recorte_id: recorte }],
  };
  const from = (table: string) => {
    const response = Promise.resolve({ data: data[table], error: null });
    const builder = { select: () => builder, eq: () => builder, in: () => builder, maybeSingle: () => response, then: response.then.bind(response) };
    return builder;
  };
  fixtures.auth.mockResolvedValue({ supabase: { from }, lawId: 77, law: { acesso_gratuito: false }, studentId: "student" });
}

describe("leitor de recorte exige liberação comercial e estrutural", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.stubEnv("LEI_INTERATIVA_ESTRUTURAS_RECORTE", "1");
    vi.stubEnv("LEI_INTERATIVA_RECORTES_HABILITADOS", id);
  });
  afterEach(() => vi.unstubAllEnvs());
  it("fica fechado por padrão, sem carregar conteúdo ou autenticar", async () => {
    vi.stubEnv("LEI_INTERATIVA_ESTRUTURAS_RECORTE", "");
    expect(await read()).toBeNull();
    expect(fixtures.auth).not.toHaveBeenCalled();
  });
  it("não usa a liberação de outro recorte", async () => {
    database(other);
    await expect(read()).rejects.toMatchObject({ status: 403 });
    expect(fixtures.model).not.toHaveBeenCalled();
  });
  it("mantém em preparação se o recorte não tem estruturas liberadas", async () => {
    database(id);
    fixtures.model.mockResolvedValue({ law: { id: 77 }, integrity: { readingAvailable: false } });
    expect(await read()).toBeNull();
  });
  it("carrega só a seleção do recorte sem exigir liberação integral", async () => {
    database(id);
    fixtures.model.mockResolvedValue({ law: { id: 77 }, integrity: { readingAvailable: true } });
    expect(await read()).toBeTruthy();
    expect(fixtures.model).toHaveBeenCalledWith("test-law", new Set([12, 19]));
  });
  it("rejeita identificador repetido em vez de tratar como lei completa", async () => {
    await expect(read(new URLSearchParams(`recorte_id=${id}&recorte_id=${other}`))).rejects.toMatchObject({ status: 400 });
    expect(fixtures.auth).not.toHaveBeenCalled();
  });
  it("permite recorte gratuito ao aluno logado mesmo sem compra desse recorte", async () => {
    database(other, true);
    fixtures.model.mockResolvedValue({ law: { id: 77 }, integrity: { readingAvailable: true } });
    expect(await read()).toBeTruthy();
  });
});
