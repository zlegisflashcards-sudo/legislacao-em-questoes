// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { LegiscastAudioTrack } from "@/components/legiscast-audio-player";
import {
  continuousReadingMarkerStorageKey,
  saveContinuousReadingMarker,
} from "@/lib/legisbot/continuous-reading-navigation-core";
import ContinuousReadingClient from "./continuous-reading-client";

vi.mock("@/lib/supabase", () => ({
  supabase: {
    auth: {
      getSession: async () => ({
        data: { session: { access_token: "fixture-token", user: { id: "fixture-student" } } },
      }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
    },
  },
}));

const slug = "fixture-lei";
const title = { id: 222, type: "titulo", name: "Título 01" };
const chapters = [
  { id: 223, type: "capitulo", name: "Capítulo 01" },
  { id: 224, type: "capitulo", name: "Capítulo 02" },
];
const referenceIds = [
  "11234567-1234-4567-8123-123456789abc",
  "21234567-1234-4567-8123-123456789abc",
];
const references = chapters.map((chapter, index) => ({
  id: referenceIds[index],
  slug,
  ordem: `000${index + 1}.0.00.0.00.0`,
  identificacao: `Art. ${index + 1}º`,
  sourceQuestionId: null,
  prepared: true,
  hierarchy: [title, chapter],
  priority: "nao_mapeado" as const,
  recent: false,
  linkedQuestions: 0,
  inactive: false,
}));
const blocks = references.map((reference) => ({ ...reference, legislation: "<p>Texto de teste.</p>" }));
const structures = [title, ...chapters].map((node, index) => ({
  ...node,
  parentId: index === 0 ? null : title.id,
  order: index || 1,
  status: "accessible" as const,
}));
const tracks = chapters.map((chapter, index): LegiscastAudioTrack => ({
  id: `faixa-${index + 1}`,
  title: `Faixa ${index + 1}`,
  durationSeconds: 180,
  description: "",
  structureId: chapter.id,
  url: `/fixture-faixa-${index + 1}.m4a`,
}));

describe("áudio na leitura contínua do aluno", () => {
  let container: HTMLDivElement;
  let root: Root;
  let audioRequests: number[];
  let originalScrollIntoView: PropertyDescriptor | undefined;

  beforeEach(() => {
    window.localStorage.clear();
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    vi.stubGlobal("matchMedia", vi.fn(() => ({ matches: false })));
    originalScrollIntoView = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "scrollIntoView");
    Object.defineProperty(HTMLElement.prototype, "scrollIntoView", { configurable: true, value: vi.fn() });

    audioRequests = [];
    vi.stubGlobal("fetch", vi.fn(async (input: string) => {
      const url = new URL(input, window.location.origin);
      const json = (data: unknown) => new Response(JSON.stringify(data));
      if (url.pathname.endsWith("/legiscast")) {
        const structureId = Number(url.searchParams.get("structure_id"));
        audioRequests.push(structureId);
        const audio = tracks.find((track) => track.structureId === structureId);
        return json({ audio: audio ?? null, status: audio ? "direct" : "unavailable" });
      }
      if (url.pathname.endsWith("/references")) return json({ blocks });
      if (url.pathname.endsWith("/destaques")) return json({ success: true, highlights: [] });
      throw new Error(`Requisição inesperada no teste: ${url.pathname}`);
    }));

    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    window.localStorage.clear();
    window.history.replaceState(null, "", "/");
    if (originalScrollIntoView) {
      Object.defineProperty(HTMLElement.prototype, "scrollIntoView", originalScrollIntoView);
    } else {
      Reflect.deleteProperty(HTMLElement.prototype, "scrollIntoView");
    }
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  function mount() {
    return act(async () => root.render(
      <ContinuousReadingClient
        slug={slug}
        title="Lei de teste"
        references={references}
        structures={structures}
        initialStructureId={title.id}
        initialBlocks={blocks}
        partialMode
        initialTab="legisbot"
      />,
    ));
  }

  function clickButton(label: string) {
    const button = [...container.querySelectorAll("button")].find((item) =>
      item.getAttribute("aria-label") === label || item.textContent?.trim().startsWith(label),
    );
    if (!button) throw new Error(`Botão não encontrado: ${label}`);
    return act(async () => button.click());
  }

  it.each([
    { scenario: "abrir a unidade sem faixa anterior", marker: false, track: tracks[0] },
    { scenario: "retomar após a marca de leitura sem faixa anterior", marker: true, track: tracks[1] },
  ])("consulta e seleciona o áudio ao $scenario", async ({ marker, track }) => {
    if (marker) {
      const key = continuousReadingMarkerStorageKey({ accountId: "fixture-student", lawSlug: slug, recorteId: null });
      saveContinuousReadingMarker(window.localStorage, key, referenceIds[0]);
    }

    await mount();

    expect(audioRequests).toEqual([track.structureId]);
    expect(container.textContent).not.toContain("Carregando áudio desta unidade");
    expect(container.querySelector("audio")?.getAttribute("src")).toBe(track.url);
  });

  it("preserva faixa e posição ao avançar e só troca por escolha explícita, sem autoplay", async () => {
    const play = vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue(undefined);
    await mount();
    const audio = container.querySelector("audio");
    if (!audio) throw new Error("Player inicial não encontrado");
    expect(audio.getAttribute("src")).toBe(tracks[0].url);
    expect(play).not.toHaveBeenCalled();
    await clickButton("Reproduzir");
    audio.currentTime = 37;
    expect(play).toHaveBeenCalledTimes(1);

    await clickButton("Avançar →");

    expect(audioRequests).toEqual(chapters.map((chapter) => chapter.id));
    expect(container.querySelector("audio")).toBe(audio);
    expect(audio.getAttribute("src")).toBe(tracks[0].url);
    expect(audio.currentTime).toBe(37);
    expect(play).toHaveBeenCalledTimes(1);

    await clickButton("Usar áudio desta unidade");

    expect(container.querySelector("audio")?.getAttribute("src")).toBe(tracks[1].url);
    expect(play).toHaveBeenCalledTimes(1);
  });
});
