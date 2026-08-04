import { afterEach, describe, expect, it, vi } from "vitest";
import { isOfflineBuild } from "./build-mode";
import { getLegislacoes } from "./legislacoes";
import { getRankingLegisData } from "./ranking-sheets";
import { buscarComentariosPublicosPorSlug } from "./legisbot/comentarios-publicos";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("offline build mode", () => {
  it("is enabled only by the explicit server-side flag", () => {
    expect(isOfflineBuild({ BUILD_OFFLINE: "true" })).toBe(true);
    expect(isOfflineBuild({ BUILD_OFFLINE: "false" })).toBe(false);
    expect(isOfflineBuild({})).toBe(false);
  });

  it("uses local catalog and ranking fallbacks without fetching", async () => {
    vi.stubEnv("BUILD_OFFLINE", "true");
    vi.stubEnv("GOOGLE_SHEETS_CSV_URL", "https://example.invalid/catalog.csv");
    vi.stubEnv("NEXT_PUBLIC_RANKING_SHEET_ID", "remote-sheet-id");
    const fetchSpy = vi.fn(() => {
      throw new Error("fetch must not run during an offline build");
    });
    vi.stubGlobal("fetch", fetchSpy);

    const legislacoes = await getLegislacoes();
    const ranking = await getRankingLegisData();

    expect(legislacoes.map(({ slug }) => slug)).toContain("constituicao-federal");
    expect(ranking.ranking).toEqual([]);
    expect(ranking.tema.temaAtual).toBe("Tema da Liga");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("returns neutral public comments without loading Supabase", async () => {
    vi.stubEnv("BUILD_OFFLINE", "true");

    await expect(
      buscarComentariosPublicosPorSlug("constituicao-federal"),
    ).resolves.toEqual([]);
  });

  it("preserves the normal remote catalog path when offline mode is disabled", async () => {
    vi.stubEnv("BUILD_OFFLINE", "false");
    vi.stubEnv("GOOGLE_SHEETS_CSV_URL", "https://example.invalid/catalog.csv");
    const fetchSpy = vi.fn().mockResolvedValue(
      new Response("codigo,nome\n", {
        status: 200,
        headers: { "content-type": "text/csv" },
      }),
    );
    vi.stubGlobal("fetch", fetchSpy);

    await expect(getLegislacoes()).resolves.toEqual([]);
    expect(fetchSpy).toHaveBeenCalledOnce();
  });
});
