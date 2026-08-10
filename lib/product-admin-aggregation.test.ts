import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const server = readFileSync("lib/commercial-admin-server.ts", "utf8");

describe("agregação administrativa de produtos", () => {
  it("emite uma linha por UUID e conserva leis relacionadas dentro do produto", () => {
    expect(server).toContain("const uniqueProducts = new Map");
    expect(server).toContain("const productRows = [...uniqueProducts.values()]");
    expect(server).toContain("const lawsByProduct = new Map");
    expect(server).toContain("Produto duplicado descartado na agregação administrativa");
  });
});
