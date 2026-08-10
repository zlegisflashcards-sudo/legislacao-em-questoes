import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("cards comerciais do catálogo", () => {
  const loader = readFileSync("lib/catalog-products-server.ts", "utf8");
  const cards = readFileSync("components/home-categorias-vade-mecum.tsx", "utf8");
  const search = readFileSync("components/legislacao-search.tsx", "utf8");
  const home = readFileSync("app/page.tsx", "utf8");

  it("busca produtos ativos para pesquisa e limita destaque à vitrine", () => {
    expect(loader).toContain('from("produtos")');
    expect(loader).toContain('from("produto_leis")');
    expect(loader).toContain('from("materiais_leis")');
    expect(loader).toContain('async function loadCatalogProducts(destaque = false)');
    expect(loader).toContain('if (destaque) productsQuery = productsQuery.eq("destaque", true)');
    expect(loader).toContain('return loadCatalogProducts();');
    expect(loader).toContain('return loadCatalogProducts(true);');
    expect(loader).toContain('eq("ativo", true)');
    expect(loader).toContain('eq("tipo", "flashcards")');
  });

  it("usa a linguagem do card de estudo e mantém o CTA para o produto", () => {
    expect(cards).toContain("produto.totalFlashcards !== null");
    expect(cards).toContain("Legislação em Questões");
    expect(cards).toContain("4.0");
    expect(cards).toContain("Acesso vitalício");
    expect(cards).toContain("Atualizado");
    expect(cards).toContain("Ilimitado");
    expect(cards).toContain("Saber mais");
    expect(cards).not.toContain("Ver produto");
    expect(cards).toContain("/leisflashcards/${produto.slug}");
    expect(cards).toContain("/leisflashcards/${legislacao.slug}");
    expect(cards).not.toContain("getVadeMecumHotmartUrl");
  });

  it("prioriza a rota interna para itens que possuem produto comercial", () => {
    expect(cards).toContain("produtos={produtos}");
    expect(cards).toContain("produtosEmDestaque.map");
    expect(search).toContain("const produtoInterno = produtos.find(");
    expect(search).toContain("/leisflashcards/${produtoInterno.slug}");
  });

  it("não consulta Google Sheets para montar a home", () => {
    expect(home).toContain("getCatalogProducts");
    expect(home).toContain("getHighlightedCatalogProducts");
    expect(home).not.toContain("getLegislacoes");
    expect(search).toContain("sugestoesProdutos");
    expect(search).toContain("/leisflashcards/${produto.slug}");
  });
});
