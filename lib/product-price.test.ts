import { describe, expect, it } from "vitest";
import { formatProductPrice } from "./product-price";

describe("preço público do produto", () => {
  it("formata o preço cadastrado em reais", () => {
    expect(formatProductPrice(49.9)).toBe("R$ 49,90");
  });

  it("não exibe preço quando ele não foi cadastrado", () => {
    expect(formatProductPrice(null)).toBeNull();
  });
});
