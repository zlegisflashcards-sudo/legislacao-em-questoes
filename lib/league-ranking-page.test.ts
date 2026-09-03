import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const page = readFileSync("components/league-ranking-page.tsx", "utf8");

describe("página reutilizável de ranking da Liga", () => {
  it("consome a configuração visual e comercial por slug", () => {
    expect(page).toContain("leaguePagePresentation(data.league)");
    expect(page).toContain("leagueProductHref(config)");
    expect(page).toContain("config.heroImage");
    expect(page).toContain("config.ctaLabel");
  });

  it("mantém o ranking limpo, sem texto sobre resultados por lei", () => {
    expect(page).not.toContain("Melhores resultados por lei");
    expect(page).toContain(">POS.</span>");
    expect(page).toContain(">JOGADOR</span>");
    expect(page).toContain(">SCORE</span>");
  });
});
