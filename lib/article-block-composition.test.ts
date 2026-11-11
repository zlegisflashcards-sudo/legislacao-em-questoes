import { describe, expect, it } from "vitest";
import { previewBlockSplit, previewBlockUnification, type ArticleBlock } from "./article-block-composition";

const block = (overrides: Partial<ArticleBlock> = {}): ArticleBlock => ({ id: "caput", leiId: 1, slug: "l13869", ordem: "0015.a.00.0.00.0", identificacao: "Art. 15-A", legislacao: "<p>Art. 15-A.</p>", updatedAt: "2026-11-10T00:00:00.000Z", situacao: "preparada", ...overrides });

describe("composição de blocos legislativos", () => {
  it("unifica caput e parágrafos adjacentes sem alterar a Ordem das questões", () => {
    const preview = previewBlockUnification({ blocks: [block(), block({ id: "p1", ordem: "0015.a.01.0.00.0", identificacao: "§ 1º", legislacao: "<p>§ 1º Primeiro.</p>" }), block({ id: "p2", ordem: "0015.a.02.0.00.0", identificacao: "§ 2º", legislacao: "<p>§ 2º Segundo.</p>" })], lawShortName: "Lei 13.869/2019", questions: [{ id: "q-1", ordem: "0015.a.02.0.00.0" }], dependencies: [{ kind: "legisbot", id: "p2", ordem: "0015.a.02.0.00.0", detail: "Comentário do § 2º" }] });
    expect(preview.target.reference).toBe("Art. 15-A, Lei 13.869/2019");
    expect(preview.archiveIds).toEqual(["p1", "p2"]);
    expect(preview.impact).toEqual([{ questionId: "q-1", ordem: "0015.a.02.0.00.0", before: "0015.a.02.0.00.0", after: "0015.a.00.0.00.0" }]);
    expect(preview.requiresCommentDecision).toBe(true);
  });

  it("rejeita blocos não adjacentes", () => expect(() => previewBlockUnification({ blocks: [block(), block({ id: "p2", ordem: "0015.a.02.0.00.0", identificacao: "§ 2º" })], lawShortName: "Lei 13.869/2019", questions: [], dependencies: [] })).toThrow("adjacentes"));

  it("calcula a resolução contra todos os blocos ativos, inclusive os não selecionados", () => {
    const preview = previewBlockUnification({ blocks: [block(), block({ id: "p1", ordem: "0015.a.01.0.00.0", identificacao: "§ 1º" })], availableBlocks: [block(), block({ id: "p1", ordem: "0015.a.01.0.00.0", identificacao: "§ 1º" }), block({ id: "p2", ordem: "0015.a.02.0.00.0", identificacao: "§ 2º" })], lawShortName: "Lei 13.869/2019", questions: [{ id: "q-3", ordem: "0015.a.02.0.00.0" }], dependencies: [] });
    expect(preview.impact[0]).toMatchObject({ before: "0015.a.02.0.00.0", after: "0015.a.02.0.00.0" });
  });

  it("separa preservando o UUID do primeiro trecho e sem distribuir comentários", () => {
    const source = block({ legislacao: "<p>Art. 15-A.</p><p>§ 1º Primeiro.</p><p>§ 2º Segundo.</p>" });
    const preview = previewBlockSplit({ block: source, lawShortName: "Lei 13.869/2019", questions: [{ id: "q-2", ordem: "0015.a.02.0.00.0" }], dependencies: [{ kind: "legisbot", id: "caput", ordem: source.ordem, detail: "Comentário do artigo inteiro" }], pieces: [
      { ordem: source.ordem, identificacao: "Art. 15-A", legislacao: "<p>Art. 15-A.</p>" },
      { ordem: "0015.a.01.0.00.0", identificacao: "§ 1º", legislacao: "<p>§ 1º Primeiro.</p>" },
      { ordem: "0015.a.02.0.00.0", identificacao: "§ 2º", legislacao: "<p>§ 2º Segundo.</p>" },
    ] });
    expect(preview.pieces.map((item) => item.reference)).toContain("Art. 15-A, § 1º, Lei 13.869/2019");
    expect(preview.impact[0]).toMatchObject({ before: source.ordem, after: "0015.a.02.0.00.0" });
    expect(preview.requiresCommentDecision).toBe(true);
  });

  it("não aceita separar com perda ou duplicação de HTML", () => expect(() => previewBlockSplit({ block: block({ legislacao: "<p>A</p><p>B</p>" }), lawShortName: "Lei 13.869/2019", questions: [], dependencies: [], pieces: [{ ordem: "0015.a.00.0.00.0", identificacao: "Art. 15-A", legislacao: "<p>A</p>" }, { ordem: "0015.a.01.0.00.0", identificacao: "§ 1º", legislacao: "<p>C</p>" }] })).toThrow("cobre exatamente"));

  it("preserva parágrafo único e letras na referência da prévia", () => {
    const source = block({ legislacao: "<p>Art. 15-A.</p><p>Parágrafo único. Texto.</p>" });
    const preview = previewBlockSplit({ block: source, lawShortName: "Lei 13.869/2019", questions: [], dependencies: [], pieces: [{ ordem: source.ordem, identificacao: "Art. 15-A", legislacao: "<p>Art. 15-A.</p>" }, { ordem: "0015.a.01.b.00.0", identificacao: "Parágrafo único", legislacao: "<p>Parágrafo único. Texto.</p>" }] });
    expect(preview.pieces[1].reference).toBe("Art. 15-A, parágrafo único, Lei 13.869/2019");
  });

  it("mostra Art. 15-A e § 1º na mesma forma da Central", () => {
    const preview = previewBlockSplit({ block: block({ legislacao: "<p>Art. 15-A.</p><p>§ 1º Texto.</p>" }), lawShortName: "Lei 13.869/2019", questions: [], dependencies: [], pieces: [
      { ordem: "0015.a.00.0.00.0", identificacao: "Art. 15-A", legislacao: "<p>Art. 15-A.</p>" },
      { ordem: "0015.a.01.0.00.0", identificacao: "§ 1º", legislacao: "<p>§ 1º Texto.</p>" },
    ] });
    expect(preview.pieces[1].reference).toBe("Art. 15-A, § 1º, Lei 13.869/2019");
  });

  it("faz todos os leitores de blocos ignorarem a situação arquivada", () => {
    for (const file of ["lib/legisbot/source.ts", "lib/legisbot/continuous-reading-server.ts", "lib/question-legislative-reference-links.ts", "lib/admin-legislative-references.ts", "lib/admin-article-center-server.ts", "lib/admin-article-conflicts-server.ts", "lib/admin-article-legisbot-conflicts.ts", "lib/admin-legislative-preview.ts", "app/api/legisbot/[slug]/destaques/route.ts"]) {
      expect(readFileSync(file, "utf8")).toContain("situacao.is.null,situacao.neq.arquivada");
    }
  });
});
import { readFileSync } from "node:fs";
