import { afterEach, describe, expect, it, vi } from "vitest";

const database = vi.hoisted(() => ({ getClient: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase-server", () => ({ getSupabaseServerClient: database.getClient }));

import { buildSalesCatalog, loadSalesCatalog, safeSalesCheckoutUrl, salesPriceCents, salesSiteOrigin } from "./catalog";

const product = { id: "p-ctb", nome: "Código de Trânsito Brasileiro", slug: "ctb", descricao: "Estude o CTB", tipo_produto: "lei_avulsa", ativo: true, preco: "29.90", hotmart_url: "https://pay.hotmart.com/A123?off=abc" };
const law = { id: 10, slug: "CTB", titulo: "Código de Trânsito Brasileiro", ativo: true, status_publicacao: "ativa", acesso_gratuito: false };
const link = { produto_id: "p-ctb", lei_id: 10, recorte_id: null, leis: law };
const base = { products: [product], links: [link], scopes: [], checks: [{ lei_id: 10, item: "questoes" }], origin: "https://www.legisflashcards.com.br" };

afterEach(() => { vi.unstubAllEnvs(); vi.resetAllMocks(); });

describe("catálogo comercial confirmado", () => {
  it("preserva preço em centavos, link cadastrado e apenas módulos confirmados", () => {
    const [item] = buildSalesCatalog(base);
    expect(item).toMatchObject({ priceCents: 2990, checkoutUrl: product.hotmart_url, availability: "ready", modules: ["Legis Questões"], freeStudyUrl: null });
    expect(item.detailUrl).toBe("https://www.legisflashcards.com.br/leisflashcards/ctb");
  });

  it("não publica produtos inativos nem produtos ligados a lei inativa", () => {
    expect(buildSalesCatalog({ ...base, products: [{ ...product, ativo: false }] })).toEqual([]);
    expect(buildSalesCatalog({ ...base, links: [{ ...link, leis: { ...law, status_publicacao: "inativa" } }] })).toEqual([]);
    expect(buildSalesCatalog({ ...base, links: [{ ...link, leis: { ...law, ativo: false } }] })).toEqual([]);
  });

  it("lei em breve nunca ganha checkout, gratuidade ou módulos disponíveis", () => {
    const [item] = buildSalesCatalog({ ...base, links: [{ ...link, leis: { ...law, status_publicacao: "em_breve", acesso_gratuito: true } }] });
    expect(item).toMatchObject({ availability: "coming_soon", checkoutUrl: null, freeStudyUrl: null, modules: [] });
  });

  it("não transforma combo com lei não publicada em oferta completa", () => {
    const input = { ...base, products: [{ ...product, tipo_produto: "combo" }], links: [link, { ...link, lei_id: 11, leis: { ...law, id: 11, status_publicacao: "em_breve" } }] };
    expect(buildSalesCatalog(input)[0]).toMatchObject({ availability: "coming_soon", checkoutUrl: null });
    expect(buildSalesCatalog({ ...input, links: [link, { ...link, lei_id: 11, leis: null }] })).toEqual([]);
  });

  it("mantém preço desconhecido como null; zero não comprova acesso gratuito", () => {
    expect(buildSalesCatalog({ ...base, products: [{ ...product, preco: null }] })[0].priceCents).toBeNull();
    expect(buildSalesCatalog({ ...base, products: [{ ...product, preco: 0 }] })[0]).toMatchObject({ priceCents: 0, freeStudyUrl: null });
    for (const invalid of [-1, "R$ 30", "", undefined, "1.001", Infinity, NaN, {}, true]) expect(salesPriceCents(invalid)).toBeNull();
    expect(salesPriceCents("19.99")).toBe(1999);
  });

  it("aceita somente hosts de checkout reconhecidos sem credenciais ou portas", () => {
    for (const url of ["http://pay.hotmart.com/X", "https://pay.hotmart.com.evil.test/X", "https://hotmart.com@evil.test/X", "https://evil.test/?to=pay.hotmart.com", "https://pay.hotmart.com:8443/X", "https://user@pay.hotmart.com/X", "javascript:alert(1)", "https://unrecognized.hotmart.com/X"]) expect(safeSalesCheckoutUrl(url)).toBeNull();
    expect(safeSalesCheckoutUrl("https://pay.hotmart.com/X")).toBe("https://pay.hotmart.com/X");
    expect(buildSalesCatalog({ ...base, products: [{ ...product, hotmart_url: "https://evil.test" }] })[0].checkoutUrl).toBeNull();
  });

  it("gratuidade depende de sinal explícito da lei ou do recorte correto", () => {
    expect(buildSalesCatalog({ ...base, links: [{ ...link, leis: { ...law, acesso_gratuito: true } }] })[0]).toMatchObject({ freeStudyUrl: "https://www.legisflashcards.com.br/estudar/lei/CTB", checkoutUrl: null });
    const scoped = { ...base, links: [{ ...link, recorte_id: "scope-1", leis: { ...law, acesso_gratuito: true } }], scopes: [{ id: "scope-1", lei_id: 10, ativo: true, status_publicacao: "ativa", acesso_gratuito: false }] };
    expect(buildSalesCatalog(scoped)[0].freeStudyUrl).toBeNull();
    expect(buildSalesCatalog({ ...scoped, scopes: [{ ...scoped.scopes[0], acesso_gratuito: true }] })[0].freeStudyUrl).toBe("https://www.legisflashcards.com.br/estudar/lei/CTB?recorte_id=scope-1");
    expect(buildSalesCatalog({ ...scoped, scopes: [{ ...scoped.scopes[0], lei_id: 99 }] })).toEqual([]);
    expect(buildSalesCatalog({ ...scoped, scopes: [{ ...scoped.scopes[0], ativo: false }] })).toEqual([]);
  });

  it("produto sem composição fica em breve e não ganha checkout", () => {
    expect(buildSalesCatalog({ ...base, links: [] })[0]).toMatchObject({ availability: "coming_soon", checkoutUrl: null, modules: [] });
  });

  it("origin inválido ou offline não chega ao cliente", () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "javascript:alert(1)");
    expect(salesSiteOrigin()).toBe("https://www.legisflashcards.com.br");
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://offline.invalid");
    expect(salesSiteOrigin()).toBe("https://www.legisflashcards.com.br");
  });

  it("falha de banco interrompe projeção em vez de inventar um catálogo", async () => {
    const query = { select: vi.fn(), eq: vi.fn(), not: vi.fn(), order: vi.fn(), range: vi.fn() };
    for (const method of [query.select, query.eq, query.not, query.order]) method.mockReturnValue(query);
    query.range.mockResolvedValue({ data: null, error: { message: "database unavailable" } });
    database.getClient.mockReturnValue({ from: vi.fn(() => query) });
    await expect(loadSalesCatalog()).rejects.toThrow("Não foi possível consultar o catálogo comercial");
  });
});
