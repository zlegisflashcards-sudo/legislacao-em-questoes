import { describe, expect, it } from "vitest";
import {
  LEGISBOT_MAX_BODY_BYTES,
  LEGISBOT_MAX_LEGISLATION_CHARS,
  LegisBotRequestError,
  normalizeLegisBotIdentifiers,
  readLegisBotGenerationBody,
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
    await expect(readLegisBotGenerationBody(request)).rejects.toMatchObject({ status: 415 });
  });

  it("rejeita body acima de 24 KB pela quantidade efetiva de bytes", async () => {
    const request = jsonRequest({ legislacao: "a".repeat(LEGISBOT_MAX_BODY_BYTES) });
    await expect(readLegisBotGenerationBody(request)).rejects.toMatchObject({ status: 413 });
  });

  it("rejeita legislação acima de 16 mil caracteres", async () => {
    const request = jsonRequest({ legislacao: "a".repeat(LEGISBOT_MAX_LEGISLATION_CHARS + 1) });
    await expect(readLegisBotGenerationBody(request)).rejects.toMatchObject({ status: 413 });
  });

  it("remove HTML, controles e normaliza Unicode e quebras de linha", async () => {
    const request = jsonRequest({
      titulo: "  Co\u0000digo Penal  ",
      assunto: "Artigo e\u0301",
      legislacao: "<p>Linha 1</p>\r\n<script>ignorar()</script><p>Linha 2</p>",
    });
    await expect(readLegisBotGenerationBody(request)).resolves.toEqual({
      titulo: "Codigo Penal",
      assunto: "Artigo é",
      legislacao: "Linha 1\nLinha 2",
    });
  });

  it("rejeita legislação vazia após sanitização", async () => {
    await expect(readLegisBotGenerationBody(jsonRequest({ legislacao: "<script>x()</script>" })))
      .rejects.toMatchObject({ status: 400 });
  });

  it("aceita campos ausentes para item já existente", async () => {
    await expect(readLegisBotGenerationBody(jsonRequest({}))).resolves.toEqual({
      titulo: null,
      assunto: null,
      legislacao: null,
    });
  });

  it("aceita origem da própria aplicação e rejeita origem externa", () => {
    expect(() => validateLegisBotRequestOrigin(jsonRequest({}, { Origin: "https://www.legisflashcards.com.br" }))).not.toThrow();
    expect(() => validateLegisBotRequestOrigin(jsonRequest({}, { Origin: "https://attacker.example" })))
      .toThrow(LegisBotRequestError);
  });
});
