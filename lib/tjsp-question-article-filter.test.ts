import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildLawApkg } from "./anki-apkg-export";
import { parseLegisApkg } from "./anki-apkg-import";
import { questionArticleIsInTjspScope, studyQuestionsInScope } from "./tjsp-question-article-filter";

const cpp = "7986ba0a-6707-46cd-9475-9ad5f52e3593";
const cp = "3e03d11b-cf6e-43f3-9d35-760fd3034d9b";
const cf = "69639148-cc8b-4de1-ba87-53fe18a0a8b1";
const juizados = "01fd3157-dcc6-4c4a-92ca-e8af4b549c40";
const ordem = (article: number, suffix = "0") => `${String(article).padStart(4, "0")}.${suffix}.00.0.00.0`;

describe("arts. do edital TJSP 02/2026 aplicados ao recorte de questões", () => {
  it.each([
    [61, cpp, 259, "0", false], [61, cpp, 260, "0", false], [61, cpp, 261, "0", true],
    [61, cpp, 267, "0", true], [61, cpp, 268, "0", false], [61, cpp, 394, "a", true],
    [58, cp, 311, "0", false], [58, cp, 311, "a", true], [58, cp, 313, "b", true],
    [58, cp, 333, "0", true], [58, cp, 337, "a", false], [58, cp, 359, "c", false],
    [14, cf, 13, "0", true], [14, cf, 14, "0", false], [14, cf, 42, "0", false],
    [14, cf, 92, "0", true], [14, cf, 93, "0", false],
    [27, juizados, 12, "a", true], [27, juizados, 83, "0", true], [27, juizados, 84, "0", false],
    [27, juizados, 89, "0", true], [27, juizados, 90, "a", false],
  ] as const)("lei %s, recorte %s, art. %s (%s): %s", (law, recorte, article, suffix, pass) => {
    expect(questionArticleIsInTjspScope(law, recorte, ordem(article, suffix))).toBe(pass);
  });

  it("não confia em ordem ausente ou inválida, lei divergente ou estrutura não selecionada", () => {
    expect(questionArticleIsInTjspScope(61, cpp, "Art. 261")).toBe(false);
    expect(questionArticleIsInTjspScope(61, cpp, null)).toBe(false);
    expect(questionArticleIsInTjspScope(58, cpp, ordem(261))).toBe(false);
    const items = [{ id: "a", structure_id: 10, ordem: ordem(261) }, { id: "b", structure_id: 20, ordem: ordem(261) }];
    expect(studyQuestionsInScope(items, [10], 61, cpp).map((q) => q.id)).toEqual(["a"]);
    expect(studyQuestionsInScope(items, [], 61, cpp)).toEqual([]);
  });

  it("não muda a lei integral nem recortes não configurados", () => {
    const items = [{ id: "a", structure_id: 10, ordem: ordem(259) }, { id: "b", structure_id: null, ordem: "" }];
    expect(studyQuestionsInScope(items, null, 61, null)).toEqual(items);
    expect(studyQuestionsInScope(items, [10], 61, "outro-recorte")).toEqual([items[0]]);
  });

  it("o APKG serializa os mesmos IDs do estudo, sem alterar o capítulo ou o baralho integral", async () => {
    const structure = [{ id: 644, parent_id: null, nome: "Capítulo 03 - Do Acusado e Seu Defensor" }];
    const rows = [259, 260, 261, 267].map((article) => ({
      id: `questao-${article}`, estrutura: 644, structure_id: 644, ordem: ordem(article),
      pergunta: `Item do artigo ${article}`, resposta: "Certo",
    }));
    const scopeQuestions = studyQuestionsInScope(rows, [644], 61, cpp);
    const law = { slug: "cpp", titulo: "Código de Processo Penal" };
    const exported = await buildLawApkg(law, scopeQuestions, structure);
    const parsed = await parseLegisApkg(Buffer.from(exported.bytes));
    expect(parsed.rows.map((row) => row.id_questao)).toEqual(scopeQuestions.map((row) => row.id));
    expect(parsed.rows.map((row) => row.ordem)).toEqual([ordem(261), ordem(267)]);
    expect(exported.decks).toEqual(["Código de Processo Penal::Capítulo 03 - Do Acusado e Seu Defensor"]);
    expect((await buildLawApkg(law, rows, structure)).notes).toBe(4);
  });

  it("a rota de questões e o download autorizado chamam o mesmo resolvedor", () => {
    const read = (path: string) => readFileSync(path, "utf8");
    expect(read("app/api/questoes/[slug]/estudar/route.ts")).toContain("resolveQuestionsForLawScope(law.id, recorteId)");
    expect(read("lib/law-apkg-scope-download-server.ts")).toContain("resolveQuestionsForLawScope(context.lawId, recorteId)");
    expect(read("lib/law-question-scopes.ts")).toContain("studyQuestionsInScope(questions");
  });
});
