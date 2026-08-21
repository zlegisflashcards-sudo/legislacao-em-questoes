import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const counts = readFileSync("lib/question-counts-server.ts", "utf8");
const unified = readFileSync("lib/unified-questions-staging-server.ts", "utf8");
const catalog = readFileSync("lib/legislation-question-counts-server.ts", "utf8");

describe("contagem automática de flashcards", () => {
  it("conta somente questões ativas por lei em cada fonte explícita", () => {
    expect(counts).toContain('from("questions")');
    expect(counts).toContain('.eq("law_id", law.id)');
    expect(counts).toContain('.eq("ativo", true)');
    expect(unified).toContain("from public.questions where lei_id=$1 and ativo=true");
    expect(counts).not.toContain("total_artigos");
    expect(counts).not.toContain("quantidade_itens");
  });

  it("usa slug para selecionar a fonte e devolve zero para lei sem questões", () => {
    expect(counts).toContain("usesUnifiedStagingQuestions");
    expect(unified).toContain('Boolean(process.env.STAGING_DATABASE_URL)');
    expect(counts).toContain("new Map(unique.map((slug) => [slug, 0]))");
    expect(catalog).toContain("counts.get(legislacao.slug) ?? 0");
  });

  it("não cria contador sincronizado nem consulta materiais", () => {
    expect(catalog).not.toContain("materiais_leis");
    expect(counts).not.toContain("update(");
    expect(counts).not.toContain("insert(");
  });
});
