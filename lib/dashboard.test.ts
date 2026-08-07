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

  it("mantém a orientação disponível para os fluxos que ainda a utilizam", () => {
    expect(dailyGuidance(false)).toBe("Faça primeiro sua revisão diária antes de avançar para um novo conteúdo.");
    expect(dailyGuidance(true)).toBe("Revisão concluída. Agora você pode avançar no seu edital.");
  });

  it("mostra a saudação e o acesso real às leis adquiridas", () => {
    const source = readFileSync("components/dashboard-client.tsx", "utf8");
    expect(source).toContain("`Olá, ${nomePublico}`");
    expect(source).toContain('href="/minhas-leis"');
    expect(source).toContain("Acessar minhas leis adquiridas");
  });

  it("apresenta somente um spoiler discreto dos recursos futuros", () => {
    const source = readFileSync("components/dashboard-client.tsx", "utf8");
    const spoiler = source.slice(source.indexOf('<aside aria-labelledby="dashboard-coming-soon-title"'), source.indexOf("</aside>") + "</aside>".length);
    expect(spoiler).toContain("Em breve");
    expect(spoiler).toContain("Seu painel de estudos ficará ainda mais completo, com edital personalizado, progresso, sequência de revisões e acompanhamento da sua evolução.");
    expect(spoiler).not.toContain("<button");
    expect(spoiler).not.toContain("<Link");
  });

  it("não exibe métricas, progresso ou edital simulados no painel provisório", () => {
    const source = readFileSync("components/dashboard-client.tsx", "utf8");
    for (const forbidden of ["streakAtual", "hojeConcluida", "editalAtivo", "progressbar", "Marcar revisão", "Abrir meu edital", "Sequência de estudos"]) {
      expect(source).not.toContain(forbidden);
    }
  });

  it("protege a rota no cliente e preserva o retorno", () => {
    const source = readFileSync("components/dashboard-client.tsx", "utf8");
    expect(source).toContain("/conta?modo=login&retorno=%2Fdashboard");
    expect(source).toContain('Authorization: `Bearer ${token}`');
  });
});
