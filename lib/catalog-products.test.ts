import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("cards comerciais do catálogo", () => {
  const loader = readFileSync("lib/catalog-products-server.ts", "utf8");
  const cards = readFileSync("components/home-categorias-vade-mecum.tsx", "utf8");

  it("busca produtos, leis vinculadas e materiais ativos", () => {
    expect(loader).toContain('from("produtos")');
    expect(loader).toContain('from("produto_leis")');
    expect(loader).toContain('from("materiais_leis")');
    expect(loader).toContain('eq("tipo", "flashcards")');
  });

  it("exibe contagens reais e mantém o CTA para o produto", () => {
    expect(cards).toContain("produto.leisIncluidas");
    expect(cards).toContain("produto.totalFlashcards !== null");
    expect(cards).toContain("Acesso vitalício");
    expect(cards).toContain("Material atualizado");
    expect(cards).toContain("/leisflashcards/${produto.slug}");
  });
});
