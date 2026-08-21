import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseLegisApkg } from "./anki-apkg-import";

const fixture = "C:/Users/User/Downloads/Lei 14.751 (Lei Orgânica das Polícias Militares e Corpos de Bombeiros Militares).apkg";

describe("APKG Legis Flashcards 4.0", () => {
  it("converte notes Certo/Errado pelo nome dos campos e não pelos índices", async () => {
    if (!existsSync(fixture)) return;
    const parsed = await parseLegisApkg(readFileSync(fixture));
    expect(parsed.notes).toBe(99);
    expect(parsed.cards).toBe(115);
    expect(parsed.rows).toHaveLength(90);
    expect(parsed.recognizedModels).toContain("1 - certo ou errado 4.0");
    expect(parsed.rows[0]).toMatchObject({ resposta: "Errado", slug: "l14751", ordem: "0002.0.00.00" });
    expect(parsed.rows[0].deck).toHaveLength(2);
    expect(parsed.unrecognizedModels.map((model) => model.name)).toEqual(expect.arrayContaining(["2 - Omissão de Palavras 4.0", "4 - Card especial 4.0"]));
  });
});
