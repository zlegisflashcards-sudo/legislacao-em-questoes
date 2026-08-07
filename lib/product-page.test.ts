import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("página comercial de produto", () => {
  const source = readFileSync("app/leisflashcards/[slug]/page.tsx", "utf8");

  it("consulta produto e leis vinculadas no banco", () => {
    expect(source).toContain('from("produtos")');
    expect(source).toContain('from("produto_leis")');
    expect(source).toContain('from("materiais_leis")');
  });

  it("inclui slugs de produtos ativos na rota comercial", () => {
    expect(source).toContain("let slugsProdutos: string[] = []");
    expect(source).toContain("...slugsProdutos");
  });

  it("usa apenas checkout cadastrado e preserva o fallback da página anterior", () => {
    expect(source).toContain("produto.hotmartUrl");
    expect(source).toContain("Link de aquisição indisponível");
    expect(source).toContain("if (produto)");
  });

  it("prioriza video proprio e evita CTAs duplicados", () => {
    expect(source).toContain("video_demo_url");
    expect(source).toContain("const selectedVideoUrl = produto.videoDemoUrl ?? videoUrl");
    expect(source).toContain("const isLeiAvulsa = produto.leis.length === 1");
    expect(source).not.toContain("Comprar agora");
  });
});
