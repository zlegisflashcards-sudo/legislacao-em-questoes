import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const page = readFileSync("app/leis/[slug]/page.tsx", "utf8");

describe("página pública da lei", () => {
  it("mostra apenas o Top 10 público da lei", () => {
    expect(page).toContain('loadPublicLawRanking(slug)');
    expect(page).toContain('Ranking da Lei');
    expect(page).toContain('Ranking Legis Questões desta Lei');
    expect(page).toContain('aria-label="Top 10 da lei"');
    expect(page).toContain('entry.publicName');
    expect(page).toContain('entry.score.toLocaleString("pt-BR")');
    expect(page).not.toContain('Sua posição');
    expect(page).not.toContain('Ver ranking completo');
  });

  it("informa o estado vazio e oculta a interface pública de Legislação Comentada", () => {
    expect(page).toContain('Ainda não há participantes no ranking desta lei.');
    expect(page).not.toContain('LegisBotCommentsIndex');
    expect(page).not.toContain('buscarComentariosPublicosPorSlug');
  });

  it("deixa o ranking no fim, imediatamente antes do CTA comercial", () => {
    expect(page.lastIndexOf('aria-labelledby="law-ranking-title"')).toBeLessThan(page.lastIndexOf("Adquirir (garantia Hotmart)"));
    expect(page.lastIndexOf("Adquirir (garantia Hotmart)")).toBeGreaterThan(page.lastIndexOf("LegislacaoEmbed"));
    expect(page).toContain("Adquira nossos flashcards e entre no ranking.");
  });
});
