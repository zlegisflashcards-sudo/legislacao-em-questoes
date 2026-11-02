import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getSupabaseServerClient: vi.fn(),
  activeQuestionCountsBySlug: vi.fn(),
  isOfflineBuild: vi.fn(() => false),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase-server", () => ({ getSupabaseServerClient: mocks.getSupabaseServerClient }));
vi.mock("@/lib/question-counts-server", () => ({ activeQuestionCountsBySlug: mocks.activeQuestionCountsBySlug }));
vi.mock("@/lib/build-mode", () => ({ isOfflineBuild: mocks.isOfflineBuild }));

import { getCatalogProducts, getHighlightedCatalogProducts, getHomeCatalogProducts, splitHomeCatalogProducts } from "./catalog-products-server";

type Filter = { table: string; column: string; value: unknown };

class Query {
  constructor(private data: unknown, private readonly table: string, private readonly filters: Filter[], private readonly count: number | null) {}
  select(..._args: unknown[]) { return this; }
  eq(column: string, value: unknown) {
    this.filters.push({ table: this.table, column, value });
    if (this.table === "produtos" && column === "destaque" && Array.isArray(this.data)) this.data = this.data.filter((row) => typeof row === "object" && row !== null && "destaque" in row && row.destaque === value);
    return this;
  }
  not(..._args: unknown[]) { return this; }
  order(..._args: unknown[]) { return this; }
  in(..._args: unknown[]) { return this; }
  then<TResult1 = { data: unknown; error: null; count: number | null }, TResult2 = never>(
    onfulfilled?: ((value: { data: unknown; error: null; count: number | null }) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ) {
    return Promise.resolve({ data: this.data, error: null, count: this.count }).then(onfulfilled, onrejected);
  }
}

function configureCatalogQueries(productCount: number | null = 2) {
  const calls: string[] = [];
  const filters: Filter[] = [];
  const rows: Record<string, unknown> = {
    produtos: [
      { id: "p-1", nome: "Primeiro", slug: "primeiro", tipo_produto: "combo", destaque: false },
      { id: "p-2", nome: "Destaque", slug: "destaque", tipo_produto: "lei_avulsa", destaque: true },
    ],
    produto_leis: [
      { produto_id: "p-1", lei_id: 10, recorte_id: null, leis: { slug: "lei-a", status_publicacao: "ativa" } },
      { produto_id: "p-1", lei_id: 11, recorte_id: null, leis: { slug: "lei-b", status_publicacao: "ativa" } },
      { produto_id: "p-2", lei_id: 11, recorte_id: null, leis: { slug: "lei-b", status_publicacao: "ativa" } },
    ],
    admin_law_overview_checks: [
      { lei_id: 10, item: "questoes" },
      { lei_id: 11, item: "questoes" },
      { lei_id: 11, item: "anki" },
      { lei_id: 11, item: "legiscast" },
      { lei_id: 11, item: "materiais" },
    ],
  };
  mocks.getSupabaseServerClient.mockReturnValue({ from: (table: string) => { calls.push(table); return new Query(rows[table] ?? [], table, filters, table === "produtos" ? productCount : null); } });
  mocks.activeQuestionCountsBySlug.mockResolvedValue(new Map([["lei-a", 5], ["lei-b", 10]]));
  return { calls, filters };
}

describe("cards comerciais do catálogo", () => {
  const loader = readFileSync("lib/catalog-products-server.ts", "utf8");
  const cards = readFileSync("components/home-categorias-vade-mecum.tsx", "utf8");
  const search = readFileSync("components/legislacao-search.tsx", "utf8");
  const home = readFileSync("app/page.tsx", "utf8");

  it("busca produtos ativos para pesquisa e limita destaque à vitrine", () => {
    expect(loader).toContain('from("produtos")');
    expect(loader).toContain('from("produto_leis")');
    expect(loader).toContain('leis(slug,status_publicacao)');
    expect(loader).toContain('select("lei_id,item")');
    expect(loader).toContain('select("id,nome,slug,ordem,tipo_produto,destaque", { count: "exact" })');
    expect(loader).toContain('recorte_id');
    expect(loader).toContain('aggregateCatalogModuleAvailability');
    expect(loader).toContain('product.tipo_produto === "lei_avulsa"');
    expect(loader).toContain("activeQuestionCountsBySlug");
    expect(loader).toContain('async function loadCatalogProducts(destaque = false)');
    expect(loader).toContain('export async function getHomeCatalogProducts()');
    expect(loader).toContain('if (destaque) productsQuery = productsQuery.eq("destaque", true)');
    expect(loader).toContain('eq("ativo", true)');
    expect(loader).not.toContain('from("materiais_leis")');
    expect(loader).not.toContain("quantidade_itens");
  });

  it("usa a linguagem do card de estudo e mantém o CTA para o produto", () => {
    expect(cards).toContain("produto.totalFlashcards !== null");
    expect(cards).toContain("Legislação em Questões");
    expect(cards).toContain("4.0");
    expect(cards).toContain("Legis Questões");
    expect(cards).toContain("Flashcards Anki");
    expect(cards).toContain("LegisCast");
    expect(cards).toContain('"PDF"');
    expect(cards).toContain("Em produção");
    expect(cards).not.toContain("LegisCast + PDF");
    for (const antigo of ["Acesso vitalício", "Atualizado", "Ilimitado"]) expect(cards).not.toContain(antigo);
    expect(cards).toContain("min-w-0 space-y-3 text-sm font-bold");
    expect(cards).toContain('className="min-w-0 break-words"');
    expect(cards).toContain("Saber mais");
    expect(cards).not.toContain("Ver produto");
    expect(cards).toContain("/leisflashcards/${produto.slug}");
    expect(cards).toContain("/leisflashcards/${legislacao.slug}");
    expect(cards).not.toContain("getVadeMecumHotmartUrl");
  });

  it("prioriza a rota interna para itens que possuem produto comercial", () => {
    expect(cards).toContain("legislacoes={legislacoes}");
    expect(cards).toContain("produtos={produtos}");
    expect(cards).toContain("produtosEmDestaque.map");
    expect(search).toContain("const produtoInterno = produtos.find(");
    expect(search).toContain("/leisflashcards/${produtoInterno.slug}");
  });

  it("consulta leis ativas para a busca pública", () => {
    expect(home).toContain("getHomeCatalogProducts");
    expect(home).not.toContain("getHighlightedCatalogProducts");
    expect(home).toContain("getLegislacoes");
    expect(home).toContain("filtrarLegislacoesAtivas(legislacoes)");
    expect(search).toContain("sugestoesProdutos");
    expect(search).toContain("/leisflashcards/${produto.slug}");
  });
  it("deriva a vitrine da mesma lista sem alterar os cards do catálogo", () => {
    const modules = { questoes: true, anki: true, legiscast: false, materiais: false };
    const result = splitHomeCatalogProducts([
      { id: "1", nome: "Produto destacado", slug: "destacado", leisIncluidas: 1, totalFlashcards: 10, modules, destaque: true },
      { id: "2", nome: "Produto normal", slug: "normal", leisIncluidas: 2, totalFlashcards: 20, modules, destaque: false },
    ]);
    expect(result.products).toEqual([
      { id: "1", nome: "Produto destacado", slug: "destacado", leisIncluidas: 1, totalFlashcards: 10, modules },
      { id: "2", nome: "Produto normal", slug: "normal", leisIncluidas: 2, totalFlashcards: 20, modules },
    ]);
    expect(result.highlightedProducts).toEqual([result.products[0]]);
  });
  it("faz uma única cadeia de consultas para a home e mantém ordem, destaque e múltiplas leis", async () => {
    const { calls } = configureCatalogQueries();
    const result = await getHomeCatalogProducts();
    expect(calls).toEqual(["produtos", "produto_leis", "admin_law_overview_checks"]);
    expect(mocks.activeQuestionCountsBySlug).toHaveBeenCalledOnce();
    expect(result.products.map((product) => [product.slug, product.totalFlashcards, product.leisIncluidas])).toEqual([
      ["primeiro", 15, 2],
      ["destaque", 10, 1],
    ]);
    expect(result.highlightedProducts.map((product) => product.slug)).toEqual(["destaque"]);
  });

  it("mantém os chamadores públicos com os mesmos recortes de catálogo", async () => {
    const { filters } = configureCatalogQueries();
    await expect(getCatalogProducts()).resolves.toMatchObject([{ slug: "primeiro" }, { slug: "destaque" }]);
    await expect(getHighlightedCatalogProducts()).resolves.toMatchObject([{ slug: "destaque" }]);
    expect(filters).toContainEqual({ table: "produtos", column: "destaque", value: true });
  });

  it.each([3, null])("usa a consulta destacada quando a lista completa está incompleta (%s)", async (productCount) => {
    const { calls, filters } = configureCatalogQueries(productCount);
    const result = await getHomeCatalogProducts();
    expect(result.products.map((product) => product.slug)).toEqual(["primeiro", "destaque"]);
    expect(result.highlightedProducts.map((product) => product.slug)).toEqual(["destaque"]);
    expect(calls.filter((table) => table === "produtos")).toHaveLength(2);
    expect(filters).toContainEqual({ table: "produtos", column: "destaque", value: true });
  });
});
