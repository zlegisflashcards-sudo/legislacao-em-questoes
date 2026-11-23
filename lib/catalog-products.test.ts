import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getSupabaseServerClient: vi.fn(),
  activeQuestionCountsBySlug: vi.fn(),
  mainStructure: vi.fn(),
  isOfflineBuild: vi.fn(() => false),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase-server", () => ({ getSupabaseServerClient: mocks.getSupabaseServerClient }));
vi.mock("@/lib/question-counts-server", () => ({ activeQuestionCountsBySlug: mocks.activeQuestionCountsBySlug }));
vi.mock("@/lib/questions-main-server", () => ({ mainStructure: mocks.mainStructure }));
vi.mock("@/lib/build-mode", () => ({ isOfflineBuild: mocks.isOfflineBuild }));

import { getCatalogProducts, getHighlightedCatalogProducts, getHomeCatalogProducts, splitHomeCatalogProducts } from "./catalog-products-server";

type Filter = { table: string; column: string; value: unknown };

class Query {
  constructor(private data: unknown, private readonly table: string, private readonly filters: Filter[], private readonly count: number | null, private readonly error: null | { message: string } = null) {}
  select(..._args: unknown[]) { return this; }
  eq(column: string, value: unknown) {
    this.filters.push({ table: this.table, column, value });
    if (this.table === "produtos" && column === "destaque" && Array.isArray(this.data)) this.data = this.data.filter((row) => typeof row === "object" && row !== null && "destaque" in row && row.destaque === value);
    return this;
  }
  not(..._args: unknown[]) { return this; }
  order(..._args: unknown[]) { return this; }
  in(column: string, value: unknown) {
    this.filters.push({ table: this.table, column, value });
    return this;
  }
  then<TResult1 = { data: unknown; error: null | { message: string }; count: number | null }, TResult2 = never>(
    onfulfilled?: ((value: { data: unknown; error: null | { message: string }; count: number | null }) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ) {
    return Promise.resolve({ data: this.data, error: this.error, count: this.count }).then(onfulfilled, onrejected);
  }
}

function configureCatalogQueries(productCount: number | null = 2, scope: "valid" | "missing" | "error" | "zero" | null = null) {
  const calls: string[] = [];
  const filters: Filter[] = [];
  const rows: Record<string, unknown> = {
    produtos: [
      { id: "p-1", nome: "Primeiro", slug: "primeiro", tipo_produto: "combo", destaque: false },
      { id: "p-2", nome: "Destaque", slug: "destaque", tipo_produto: "lei_avulsa", destaque: true },
    ],
    produto_leis: [
      { produto_id: "p-1", lei_id: 10, recorte_id: null, leis: { slug: "lei-a", status_publicacao: "ativa", acesso_gratuito: false } },
      { produto_id: "p-1", lei_id: 11, recorte_id: "recorte-combo", leis: { slug: "lei-b", status_publicacao: "ativa", acesso_gratuito: true } },
      { produto_id: "p-2", lei_id: 11, recorte_id: scope ? "recorte-cf" : null, leis: { slug: "lei-b", status_publicacao: "ativa", acesso_gratuito: true } },
    ],
    recortes_leis_estrutura: scope === "missing" ? [] : [
      { lei_id: 11, recorte_id: "recorte-cf", structure_id: 21 },
      { lei_id: 11, recorte_id: "recorte-cf", structure_id: 22 },
      { lei_id: 99, recorte_id: "recorte-cf", structure_id: 25 },
    ],
    admin_law_overview_checks: [
      { lei_id: 10, item: "questoes" },
      { lei_id: 11, item: "questoes" },
      { lei_id: 11, item: "anki" },
      { lei_id: 11, item: "legiscast" },
      { lei_id: 11, item: "materiais" },
    ],
  };
  mocks.getSupabaseServerClient.mockReturnValue({ from: (table: string) => { calls.push(table); return new Query(rows[table] ?? [], table, filters, table === "produtos" ? productCount : table === "questions" ? (scope === "zero" ? 0 : 202) : null, table === "questions" && scope === "error" ? { message: "Timeout" } : null); } });
  mocks.activeQuestionCountsBySlug.mockResolvedValue(new Map([["lei-a", 5], ["lei-b", scope ? 2024 : 10]]));
  mocks.mainStructure.mockResolvedValue([{ id: 21, parent_id: null }, { id: 22, parent_id: 21 }, { id: 25, parent_id: null }]);
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
    expect(loader).toContain('leis(slug,status_publicacao,acesso_gratuito)');
    expect(loader).toContain('select("lei_id,item")');
    expect(loader).toContain('select("id,nome,slug,ordem,tipo_produto,destaque,imagem_url", { count: "exact" })');
    expect(loader).toContain('recorte_id');
    expect(loader).toContain("freeStudyHref");
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
    expect(cards).toContain("Estudar grátis");
    expect(cards).toContain("FreeStudyLink");
    expect(cards).toContain('produto.tipoProduto === "combo" || produto.tipoProduto === "edital"');
    expect(cards).toContain('data-product-type={produto.tipoProduto}');
    expect(cards).toContain("isDeck && produto.imagemUrl");
    expect(cards).toContain("Imagem de ${produto.nome}");
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
      { id: "1", nome: "Produto destacado", slug: "destacado", tipoProduto: "combo", imagemUrl: null, freeStudyHref: null, leisIncluidas: 1, totalFlashcards: 10, modules, destaque: true },
      { id: "2", nome: "Produto normal", slug: "normal", tipoProduto: "lei_avulsa", imagemUrl: null, freeStudyHref: null, leisIncluidas: 2, totalFlashcards: 20, modules, destaque: false },
    ]);
    expect(result.products).toEqual([
      { id: "1", nome: "Produto destacado", slug: "destacado", tipoProduto: "combo", imagemUrl: null, freeStudyHref: null, leisIncluidas: 1, totalFlashcards: 10, modules },
      { id: "2", nome: "Produto normal", slug: "normal", tipoProduto: "lei_avulsa", imagemUrl: null, freeStudyHref: null, leisIncluidas: 2, totalFlashcards: 20, modules },
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
    expect(result.highlightedProducts[0]?.freeStudyHref).toBe("/estudar/lei/lei-b");
  });

  it("usa só as questões ativas do recorte no card gratuito em destaque, sem alterar o produto de lei inteira", async () => {
    const { filters } = configureCatalogQueries(2, "valid");
    const result = await getHomeCatalogProducts();
    expect(result.products[0]?.totalFlashcards).toBe(2029);
    expect(result.highlightedProducts[0]).toMatchObject({
      totalFlashcards: 202,
      freeStudyHref: "/estudar/lei/lei-b?recorte_id=recorte-cf",
      modules: { questoes: true, anki: false, legiscast: false, materiais: false },
    });
    expect(result.products[1]).toEqual(result.highlightedProducts[0]);
    expect(filters.filter(({ table }) => table === "recortes_leis_estrutura")).toEqual([{ table: "recortes_leis_estrutura", column: "recorte_id", value: ["recorte-cf"] }]);
    expect(filters).toContainEqual({ table: "questions", column: "ativo", value: true });
    expect(filters).toContainEqual({ table: "questions", column: "lei_id", value: 11 });
    expect(filters).toContainEqual({ table: "questions", column: "structure_id", value: [21, 22] });
  });

  it.each(["missing", "error", "zero"] as const)("distingue recorte indisponível de vazio, sem usar a lei inteira (%s)", async (scope) => {
    configureCatalogQueries(2, scope);
    const result = await getHomeCatalogProducts();
    expect(result.highlightedProducts[0]?.totalFlashcards).toBe(scope === "zero" ? 0 : null);
    expect(result.highlightedProducts[0]?.modules.questoes).toBe(false);
    expect(result.products[0]?.totalFlashcards).toBe(2029);
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
