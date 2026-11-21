// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LawLegiscastPageClient } from "./law-legiscast-page-client";

vi.mock("@/lib/supabase", () => ({
  supabase: { auth: { getSession: async () => ({ data: { session: { access_token: "fixture-audio" } } }) } },
}));
vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(),
}));

const slug = "lei-de-teste";
const audioPath = `/api/aluno/leis/${slug}/legiscast`;
const tracks = [
  { id: "primeira", structureId: 2, title: "Primeira faixa", durationSeconds: 60, url: "/faixa-1.m4a" },
  { id: "segunda", structureId: 3, title: "Segunda faixa", durationSeconds: 60, url: "/faixa-2.m4a" },
];
const structure = [
  { id: 3, parent_id: 1, tipo: "capitulo", nome: "Capítulo II", ordem: 2, pdf_page: 4 },
  { id: 1, parent_id: null, tipo: "titulo", nome: "Título I", ordem: 1, pdf_page: 1 },
  { id: 2, parent_id: 1, tipo: "capitulo", nome: "Capítulo I", ordem: 1, pdf_page: 2 },
];

describe("LegisCast separado sem PDF", () => {
  let container: HTMLDivElement;
  let root: Root;
  const mount = () => act(async () => root.render(<LawLegiscastPageClient slug={slug} />));

  beforeEach(() => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    window.localStorage.clear();
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    window.localStorage.clear();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("consulta somente o catálogo autorizado e mantém seleção em ordem legal, sem autoplay", async () => {
    const fetchMock = vi.fn(async () => Response.json({ audios: tracks, structure, recorte: null, lawTitle: "Lei de teste" }));
    vi.stubGlobal("fetch", fetchMock);
    const play = vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue(undefined);

    await mount();

    expect(fetchMock).toHaveBeenCalledExactlyOnceWith(audioPath, {
      headers: { Authorization: "Bearer fixture-audio" }, cache: "no-store",
    });
    expect(container.querySelector("h1")?.textContent).toBe("Lei de teste");
    expect(container.querySelector("audio")?.getAttribute("src")).toBe(tracks[0].url);
    const playlist = container.querySelector('nav[aria-label="Playlist do LegisCast"]');
    const choices = [...(playlist?.querySelectorAll("button") ?? [])];
    expect(choices.map((button) => button.textContent)).toEqual(["▶ Capítulo I", "▶ Capítulo II"]);
    expect(playlist?.textContent).toContain("Título I"); // Metadado de página não cria um botão de PDF.
    expect(container.textContent).not.toMatch(/PDF|Imprimir/);
    await act(async () => choices[1].click());
    expect(container.querySelector("audio")?.getAttribute("src")).toBe(tracks[1].url);
    expect(play).not.toHaveBeenCalled();
  });

  it("não renderiza título nem faixa se a autorização do catálogo falhar", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({
      message: "Lei não liberada", lawTitle: "Título privado", audios: tracks,
    }, { status: 404 })));

    await mount();

    expect(container.textContent).toContain("Lei não liberada");
    expect(container.textContent).not.toContain("Título privado");
    expect(container.querySelector("audio")).toBeNull();
  });
});
