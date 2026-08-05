import { describe, expect, it } from "vitest";
import { DEFAULT_AUTHENTICATED_PATH, safeReturnPath } from "./safe-return-path";

describe("redirecionamento após autenticação", () => {
  it("envia login direto para o dashboard", () => {
    expect(safeReturnPath(null)).toBe("/dashboard");
    expect(DEFAULT_AUTHENTICATED_PATH).toBe("/dashboard");
  });

  it("preserva caminhos internos e query strings", () => {
    expect(safeReturnPath("/legisbot/L123/1?origem=conta")).toBe("/legisbot/L123/1?origem=conta");
  });

  it.each([
    "https://example.com",
    "//example.com/roubo",
    "/\\example.com",
    "javascript:alert(1)",
  ])("rejeita retorno externo ou ambíguo: %s", (value) => {
    expect(safeReturnPath(value)).toBe("/dashboard");
  });
});
