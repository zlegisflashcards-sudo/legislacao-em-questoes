import { describe, expect, it } from "vitest";
import { resolveContestImage } from "./contest-image";

describe("resolveContestImage", () => {
  it("prioriza a imagem do produto", () => {
    expect(resolveContestImage({ productImage: "/products/pmma.png", leagueImage: "/league/pmma.png" })).toBe("/products/pmma.png");
  });

  it("usa a imagem da liga quando o produto não tem imagem válida", () => {
    expect(resolveContestImage({ productImage: "imagem-inválida", leagueImage: "/league/pmma.png" })).toBe("/league/pmma.png");
  });

  it("preserva a imagem atual da PMMA quando o produto ainda não oferece imagem", () => {
    expect(resolveContestImage({ productImage: null, leagueImage: "/league/pmma-hero.png" })).toBe("/league/pmma-hero.png");
  });

  it("deixa o componente visual aplicar o fallback sem nenhuma URL válida", () => {
    expect(resolveContestImage({ productImage: "", leagueImage: null })).toBeNull();
  });
});
