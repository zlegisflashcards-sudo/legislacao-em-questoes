import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("página comercial de produto", () => {
  const source = readFileSync("app/leisflashcards/[slug]/page.tsx", "utf8");

  it("consulta produto e leis vinculadas no banco", () => {
    expect(source).toContain('from("produtos")');
    expect(source).toContain('from("produto_leis")');
    expect(source).toContain('from("materiais_leis")');
  });

  it("usa apenas checkout cadastrado e preserva o fallback da página anterior", () => {
    expect(source).toContain("produto.hotmartUrl");
    expect(source).toContain("Link de aquisição indisponível");
    expect(source).toContain("if (produto)");
  });
});
