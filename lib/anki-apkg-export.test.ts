import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { parseLegisApkg } from "./anki-apkg-import";
import { buildLawApkg } from "./anki-apkg-export";

describe("exportação APKG", () => {
  it("usa os templates 4.0 versionados no projeto, sem caminho local do desenvolvedor", () => {
    const exporter = readFileSync("lib/anki-apkg-export.ts", "utf8");
    expect(exporter).toContain('join(process.cwd(), "public", "anki-templates")');
    expect(exporter).not.toContain("C:/Users/User/Documents/certo errado 4.0");
  });

  it("preserva campos, GUID e subdeck no round-trip", async () => {
    const exported = await buildLawApkg({ slug: "l14751", titulo: "Lei nº 14.751" }, [{ id: "questao-1", structure_id: 7, pergunta: "<strong>Enunciado</strong><br>continuação", resposta: "Certo", justificativa: "<mark>Justificativa</mark>", assunto: "Assunto", legislacao: "<div>Art. 1º</div>", ordem: "0002.0.00.00" }], [{ id: 7, parent_id: null, nome: "Capítulo 01 – DISPOSIÇÕES GERAIS" }]);
    const parsed = await parseLegisApkg(Buffer.from(exported.bytes));
    expect(exported.notes).toBe(1);
    expect(exported.decks).toEqual(["Lei nº 14.751::Capítulo 01 – DISPOSIÇÕES GERAIS"]);
    expect(parsed.rows).toHaveLength(1);
    expect(parsed.rows[0]).toMatchObject({ slug: "l14751", ordem: "0002.0.00.00", pergunta: "<strong>Enunciado</strong><br>continuação", resposta: "Certo", justificativa: "<mark>Justificativa</mark>", legislacao: "<div>Art. 1º</div>" });
    expect(parsed.rows[0].deck).toEqual(["Lei nº 14.751", "Capítulo 01 – DISPOSIÇÕES GERAIS"]);
  });

  it("não cria subdeck quando todas as questões pertencem à raiz", async () => {
    const exported = await buildLawApkg({ slug: "l9455", titulo: "Lei nº 9.455 - Crimes de Tortura" }, [{ id: "questao-1", structure_id: null, pergunta: "Item", resposta: "Errado", ordem: "0001.0.00.00" }], []);
    expect(exported.decks).toEqual(["Lei nº 9.455 - Crimes de Tortura"]);
  });
});
