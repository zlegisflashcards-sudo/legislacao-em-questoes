import { describe, expect, it } from "vitest";
import {
  LEGISBOT_MAX_BODY_BYTES,
  LegisBotRequestError,
  normalizeLegisBotIdentifiers,
  assertLegisBotIdentifiersOnlyBody,
  validateLegisBotRequestOrigin,
} from "./request-validation";

function jsonRequest(body: unknown, headers: Record<string, string> = {}) {
  return new Request("https://www.legisflashcards.com.br/api/legisbot/L123/1/generate", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

describe("validação da solicitação de geração", () => {
  it("normaliza slug e preserva a ordem válida", () => {
    expect(normalizeLegisBotIdentifiers(" l11340 ", "0004.0_1-2")).toEqual({
      slug: "L11340",
      ordem: "0004.0_1-2",
    });
  });

  it.each([
    ["slug inválido", "../LEI", "1"],
    ["ordem inválida", "LEI", "1?admin=true"],
  ])("rejeita %s", (_label, slug, ordem) => {
    expect(() => normalizeLegisBotIdentifiers(slug, ordem)).toThrow(LegisBotRequestError);
  });

  it("exige JSON", async () => {
    const request = new Request("https://example.com", { method: "POST", body: "texto" });
    await expect(assertLegisBotIdentifiersOnlyBody(request)).rejects.toMatchObject({ status: 415 });
  });

  it("rejeita body acima de 24 KB pela quantidade efetiva de bytes", async () => {
    const request = jsonRequest({ value: "a".repeat(LEGISBOT_MAX_BODY_BYTES) });
    await expect(assertLegisBotIdentifiersOnlyBody(request)).rejects.toMatchObject({ status: 413 });
  });

  it("aceita somente corpo vazio porque a fonte vem do banco", async () => {
    await expect(assertLegisBotIdentifiersOnlyBody(jsonRequest({}))).resolves.toBeUndefined();
  });

  it("rejeita título, assunto ou legislação enviados pelo cliente", async () => {
    await expect(assertLegisBotIdentifiersOnlyBody(jsonRequest({ titulo: "Forjado", legislacao: "<p>Forjada</p>" })))
      .rejects.toMatchObject({ status: 400 });
  });

  it("aceita origem da própria aplicação e rejeita origem externa", () => {
    expect(() => validateLegisBotRequestOrigin(jsonRequest({}, { Origin: "https://www.legisflashcards.com.br" }))).not.toThrow();
    expect(() => validateLegisBotRequestOrigin(jsonRequest({}, { Origin: "https://attacker.example" })))
      .toThrow(LegisBotRequestError);
  });
});
