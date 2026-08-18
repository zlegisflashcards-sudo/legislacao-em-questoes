import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  isHighlightColor,
  isHighlightCompatible,
  normalizeHighlightIdentifiers,
  rangesOverlap,
  validateHighlightSelection,
  type LegisBotHighlight,
} from "./legisbot-highlights";

const highlightsComponent = readFileSync("components/legisbot-personal-highlights.tsx", "utf8");
const legisBotPage = readFileSync("app/legisbot/legisbot-page-client.tsx", "utf8");

const highlight: LegisBotHighlight = {
  id: "4a1da739-c1ad-40d1-9f86-4b604162d09b",
  start: 6,
  end: 13,
  text: "militar",
  color: "amarelo",
  createdAt: "2026-08-17T12:00:00Z",
  updatedAt: "2026-08-17T12:00:00Z",
};

describe("destaques pessoais do LegisBot", () => {
  it("normaliza slug e preserva ordem textual", () => {
    expect(normalizeHighlightIdentifiers(" l6513ma ", "0001.0.00.00")).toEqual({
      slug: "L6513MA",
      ordem: "0001.0.00.00",
    });
  });

  it.each(["amarelo", "verde", "azul", "roxo", "rosa"])("aceita a cor %s", (color) => {
    expect(isHighlightColor(color)).toBe(true);
  });

  it.each(["laranja", "", null, 1])("rejeita cor fora da lista: %s", (color) => {
    expect(isHighlightColor(color)).toBe(false);
  });

  it("usa um único seletor modal com a seleção nativa da legislação", () => {
    expect(highlightsComponent).toContain("selectionArea.current");
    expect(highlightsComponent).toContain("textarea.selectionStart");
    expect(highlightsComponent).toContain("textarea.selectionEnd");
    expect(highlightsComponent).toContain("legislationText.slice(start, end)");
    expect(legisBotPage).toContain("legislationText={textoLegal}");
    expect(legisBotPage).not.toContain("selectionEnabled");
  });

  it("desfaz somente o destaque recém-criado usando a exclusão existente", () => {
    expect(highlightsComponent).toContain("response.status === 201");
    expect(highlightsComponent).toContain("/api/legisbot/destaques/${lastCreatedHighlight.id}");
    expect(highlightsComponent).toContain("item.id !== lastCreatedHighlight.id");
  });

  it("desfaz todos os destaques do artigo pelas exclusões existentes", () => {
    expect(highlightsComponent).toContain("Promise.all(highlights.map");
    expect(highlightsComponent).toContain("replaceHighlights([])");
    expect(highlightsComponent).toContain("↶ Desfazer tudo");
  });

  it("extrai e aceita somente o trecho literal nas posições enviadas", () => {
    const legislation = "Texto militar completo";
    expect(validateHighlightSelection(legislation, 6, 13, "militar")).toEqual({
      ok: true,
      selection: { start: 6, end: 13, text: "militar" },
    });
    expect(validateHighlightSelection(legislation, 6, 13, "civil")).toEqual({
      ok: false,
      message: "O trecho selecionado não corresponde à legislação atual.",
    });
  });

  it("rejeita seleção vazia ou fora do texto", () => {
    expect(validateHighlightSelection("Lei", 1, 1, "").ok).toBe(false);
    expect(validateHighlightSelection("Lei", -1, 2, "Le").ok).toBe(false);
    expect(validateHighlightSelection("Lei", 0, 9, "Lei").ok).toBe(false);
  });

  it("identifica sobreposição parcial e permite intervalos adjacentes", () => {
    expect(rangesOverlap(0, 5, 4, 8)).toBe(true);
    expect(rangesOverlap(0, 5, 0, 5)).toBe(true);
    expect(rangesOverlap(0, 5, 5, 8)).toBe(false);
  });

  it("não renderiza destaque se a legislação mudou", () => {
    expect(isHighlightCompatible(highlight, "Texto militar completo")).toBe(true);
    expect(isHighlightCompatible(highlight, "Texto alterado completo")).toBe(false);
  });
});
