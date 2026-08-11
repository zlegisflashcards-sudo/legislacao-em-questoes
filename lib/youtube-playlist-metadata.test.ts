import { describe, expect, it, vi } from "vitest";
import {
  fetchYoutubePlaylistItems,
  normalizeYoutubeVideoIds,
} from "./youtube-playlist-metadata";

describe("YouTube playlist metadata", () => {
  it("normaliza, deduplica e preserva a ordem dos IDs", () => {
    expect(normalizeYoutubeVideoIds([" abcDEF_123 ", "abcDEF_123", "inválido"])).toEqual([
      "abcDEF_123",
    ]);
  });

  it("mantém a ordem mesmo quando os títulos respondem em tempos diferentes", async () => {
    const fetcher = vi.fn(async (input: URL | RequestInfo) => {
      const id = new URL(String(input)).searchParams.get("url")?.split("v=")[1];
      return new Response(JSON.stringify({ title: `Título ${id}` }), { status: 200 });
    }) as typeof fetch;

    await expect(
      fetchYoutubePlaylistItems(["video_A01", "video_B02"], fetcher),
    ).resolves.toEqual([
      { id: "video_A01", title: "Título video_A01" },
      { id: "video_B02", title: "Título video_B02" },
    ]);
  });

  it("usa fallback sem numeração quando o oEmbed falha", async () => {
    const fetcher = vi.fn(async () => new Response(null, { status: 404 })) as typeof fetch;
    await expect(fetchYoutubePlaylistItems(["video_A01"], fetcher)).resolves.toEqual([
      { id: "video_A01", title: "Vídeo do LegisCast" },
    ]);
  });

  it("preserva a ordem de uma playlist longa", async () => {
    const ids = Array.from(
      { length: 55 },
      (_, index) => `vid_${String(index).padStart(7, "0")}`,
    );
    const fetcher = vi.fn(async (input: URL | RequestInfo) => {
      const id = new URL(String(input)).searchParams.get("url")?.split("v=")[1];
      return new Response(JSON.stringify({ title: `Título ${id}` }), { status: 200 });
    }) as typeof fetch;

    const items = await fetchYoutubePlaylistItems(ids, fetcher);

    expect(items).toHaveLength(55);
    expect(items.map(({ id }) => id)).toEqual(ids);
    expect(fetcher).toHaveBeenCalledTimes(55);
  });
});
