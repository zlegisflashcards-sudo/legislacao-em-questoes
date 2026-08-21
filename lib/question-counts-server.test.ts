import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const counts = readFileSync("lib/question-counts-server.ts", "utf8");
const main = readFileSync("lib/questions-main-server.ts", "utf8");
const catalog = readFileSync("lib/legislation-question-counts-server.ts", "utf8");

describe("contagem automática de flashcards", () => {
  it("conta somente questões ativas no schema principal sem carregar as questões", () => {
    expect(counts).toContain("mainActiveQuestionCountsBySlug");
    expect(main).toContain('from("questions").select("id", { count: "exact", head: true })');
    expect(main).toContain('.eq("lei_id", law.id).eq("ativo", true)');
    expect(main).not.toContain('select("lei_id")');
    const counter = main.slice(main.indexOf("export async function mainActiveQuestionCountsBySlug"));
    expect(counter).not.toContain("total_artigos");
    expect(counter).not.toContain("quantidade_itens");
  });

  it("usa slug no banco principal e devolve zero para lei sem questões", () => {
    expect(main).toContain('from("leis").select("id,slug")');
    expect(main).toContain("new Map(unique.map((slug) => [slug, 0]))");
    expect(main).not.toContain("STAGING_DATABASE_URL");
    expect(main).not.toContain("getSupabaseQuestoesClient");
    expect(catalog).toContain("counts.get(legislacao.slug) ?? 0");
  });

  it("não cria contador sincronizado nem consulta materiais", () => {
    expect(catalog).not.toContain("materiais_leis");
    expect(counts).not.toContain("update(");
    expect(counts).not.toContain("insert(");
  });
});
