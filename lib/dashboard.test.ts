import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { dailyGuidance, normalizeProgress, parseDailyReviewRpc } from "./dashboard";

describe("dashboard do estudante", () => {
  it("não inventa progresso quando o valor é ausente", () => {
    expect(normalizeProgress(null)).toBeNull();
    expect(normalizeProgress(undefined)).toBeNull();
    expect(normalizeProgress(Number.NaN)).toBeNull();
    expect(normalizeProgress(45.6)).toBe(46);
  });

  it("limita progresso válido ao intervalo acessível", () => {
    expect(normalizeProgress(-2)).toBe(0);
    expect(normalizeProgress(120)).toBe(100);
  });

  it("interpreta o estado persistido da revisão", () => {
    expect(parseDailyReviewRpc([{ data_revisao: "2026-08-04", hoje_concluida: true, streak_atual: 3 }])).toEqual({
      dataRevisao: "2026-08-04",
      hojeConcluida: true,
      streakAtual: 3,
    });
    expect(parseDailyReviewRpc([])).toEqual({ dataRevisao: null, hojeConcluida: false, streakAtual: 0 });
  });

  it("altera a orientação conforme o registro real", () => {
    expect(dailyGuidance(false)).toBe("Faça primeiro sua revisão diária antes de avançar para um novo conteúdo.");
    expect(dailyGuidance(true)).toBe("Revisão concluída. Agora você pode avançar no seu edital.");
  });

  it("mantém somente os três blocos e não apresenta métricas externas", () => {
    const source = readFileSync("components/dashboard-client.tsx", "utf8");
    expect(source.match(/<section /g)).toHaveLength(3);
    expect(source).toContain("Edital em estudo");
    expect(source).toContain("Sequência de estudos");
    expect(source).toContain("Orientação do dia");
    for (const forbidden of ["questões respondidas", "acertos", "erros", "tempo de estudo", "flashcards estudados"]) {
      expect(source.toLowerCase()).not.toContain(forbidden);
    }
  });

  it("oferece estado vazio e suporta edital ativo sem detalhar leis", () => {
    const source = readFileSync("components/dashboard-client.tsx", "utf8");
    expect(source).toContain("Você ainda não selecionou um edital");
    expect(source).toContain("Abrir meu edital");
    expect(source).toContain("editalAtivo.progresso === null");
    expect(source).not.toContain("lista de leis");
  });

  it("protege a rota no cliente e preserva o retorno", () => {
    const source = readFileSync("components/dashboard-client.tsx", "utf8");
    expect(source).toContain("/conta?modo=login&retorno=%2Fdashboard");
    expect(source).toContain('Authorization: `Bearer ${token}`');
  });
});
