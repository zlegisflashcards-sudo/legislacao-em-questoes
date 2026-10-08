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

  it("usa um único botão canônico para aprofundar o trecho no Anki", () => {
    const back = readFileSync("public/anki-templates/verso-certo-errado-4.0.txt", "utf8");
    expect(back).toContain("Aprofundar neste trecho da lei");
    expect(back.match(/class=\"lf-legisbot-link lf-card-action\"/g)).toHaveLength(1);
    expect(back).toContain("botaoLegisbot.href = hrefBase");
    expect(back).not.toContain("data-aba=");
  });

  it("preserva campos, GUID e subdeck no round-trip", async () => {
    const exported = await buildLawApkg({ slug: "l14751", titulo: "Lei nº 14.751" }, [{ id: "questao-1", structure_id: 7, pergunta: "<strong>Enunciado</strong><br>continuação", resposta: "Certo", justificativa: "<mark>Justificativa</mark>", assunto: "Assunto", legislacao: "<div>Art. 1º</div>", ordem: "0002.0.00.00" }], [{ id: 7, parent_id: null, nome: "Capítulo 01 – DISPOSIÇÕES GERAIS" }]);
    const parsed = await parseLegisApkg(Buffer.from(exported.bytes));
    expect(exported.notes).toBe(1);
    expect(exported.decks).toEqual(["Lei nº 14.751::Capítulo 01 – DISPOSIÇÕES GERAIS"]);
    expect(parsed.rows).toHaveLength(1);
    expect(parsed.rows[0]).toMatchObject({ slug: "l14751", ordem: "0002.0.00.00", pergunta: "<strong>Enunciado</strong><br>continuação", resposta: "Certo", justificativa: "<mark>Justificativa</mark>", legislacao: "<div>Art. 1º</div>" });
    expect(parsed.rows[0].id_questao).toBe("questao-1");
    expect(parsed.rows[0].deck).toEqual(["Lei nº 14.751", "Capítulo 01 – DISPOSIÇÕES GERAIS"]);
  });

  it("leva o UUID da questão para IDQuestao sem alterar Cód. ou Ordem", async () => {
    const exporter = readFileSync("lib/anki-apkg-export.ts", "utf8");
    const front = readFileSync("public/anki-templates/frente-certo-errado-4.0.txt", "utf8");
    const back = readFileSync("public/anki-templates/verso-certo-errado-4.0.txt", "utf8");
    expect(exporter).toContain('"IDQuestao"');
    for (const template of [front, back]) {
      expect(template).toContain('data-question-id="{{IDQuestao}}"');
      expect(template).toContain("Reportar erro na questão");
      expect(template).toContain("mailto:zlegisflashcards@gmail.com?subject=");
      expect(template).toContain("ID da questão: ' + questionId");
      expect(template).toContain("validUuid.test(questionId)");
      expect(template).toContain("link.hidden = true;");
      expect(template).not.toContain("/reportar-erro/questao/");
      expect(template).not.toContain("> {{IDQuestao}}<");
    }
    const exported = await buildLawApkg({ slug: "l6513-ma", titulo: "Lei de exemplo" }, [
      { id: "uuid-a", structure_id: null, pergunta: "Questão A", resposta: "Certo", ordem: "0008.0.00.00", slug: "l6513-ma" },
      { id: "uuid-b", structure_id: null, pergunta: "Questão B", resposta: "Errado", ordem: "0008.0.00.00", slug: "l6513-ma" },
    ], []);
    const parsed = await parseLegisApkg(Buffer.from(exported.bytes));
    expect(parsed.rows.map((row) => ({ id: row.id_questao, slug: row.slug, ordem: row.ordem }))).toEqual([
      { id: "uuid-a", slug: "l6513-ma", ordem: "0008.0.00.00" },
      { id: "uuid-b", slug: "l6513-ma", ordem: "0008.0.00.00" },
    ]);
  });

  it("não cria subdeck quando todas as questões pertencem à raiz", async () => {
    const exported = await buildLawApkg({ slug: "l9455", titulo: "Lei nº 9.455 - Crimes de Tortura" }, [{ id: "questao-1", structure_id: null, pergunta: "Item", resposta: "Errado", ordem: "0001.0.00.00" }], []);
    expect(exported.decks).toEqual(["Lei nº 9.455 - Crimes de Tortura"]);
  });

  it("preserva a ordem canônica quando a ordem pedagógica se repete", async () => {
    const exported = await buildLawApkg(
      { slug: "l9455", titulo: "Lei nº 9.455" },
      [
        { id: "z", structure_id: null, pergunta: "Primeira cadastrada", resposta: "Certo", ordem: "0001.0.00.00", created_at: "2026-01-01T00:00:00.000Z" },
        { id: "a", structure_id: null, pergunta: "Segunda cadastrada", resposta: "Errado", ordem: "0001.0.00.00", created_at: "2026-01-02T00:00:00.000Z" },
      ],
      [],
    );
    const parsed = await parseLegisApkg(Buffer.from(exported.bytes));
    expect(parsed.rows.map((row) => row.pergunta)).toEqual(["Primeira cadastrada", "Segunda cadastrada"]);
  });
});
