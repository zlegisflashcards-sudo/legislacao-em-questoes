import { describe, expect, it } from "vitest";
import { accountStepPath, DEFAULT_AUTHENTICATED_PATH, safeReturnPath } from "./safe-return-path";

describe("redirecionamento após autenticação", () => {
  it("envia login direto para Legis Questões", () => {
    expect(safeReturnPath(null)).toBe("/minhas-leis");
    expect(DEFAULT_AUTHENTICATED_PATH).toBe("/minhas-leis");
  });

  it("preserva caminhos internos e query strings", () => {
    expect(safeReturnPath("/legisbot/L123/1?origem=conta")).toBe("/legisbot/L123/1?origem=conta");
  });

  it("preserva contexto de recorte nas etapas de segurança", () => {
    const destination = "/questoes/lei/estudar?recorte_id=123#ponto";
    const url = new URL(accountStepPath("primeiro-acesso", destination), "https://legisflashcards.local");
    expect(url.searchParams.get("retorno")).toBe(destination);
    expect(new URL(accountStepPath("recuperar", destination), url).searchParams.get("recuperar")).toBe("1");
  });

  it("não propaga destino externo por etapas de segurança", () => {
    const url = new URL(accountStepPath("recuperar", "//example.com"), "https://legisflashcards.local");
    expect(url.searchParams.get("retorno")).toBe(DEFAULT_AUTHENTICATED_PATH);
  });

  it.each([
    "https://example.com",
    "//example.com/roubo",
    "/\\example.com",
    "javascript:alert(1)",
    "/conta?retorno=%2Fconta",
  ])("rejeita retorno externo ou ambíguo: %s", (value) => {
    expect(safeReturnPath(value)).toBe("/minhas-leis");
  });
});
