export type YoutubePlaylistItem = {
  id: string;
  title: string;
};

const MAX_IDS = 100;
const CONCURRENCY = 6;
const VIDEO_ID_PATTERN = /^[A-Za-z0-9_-]{6,20}$/;

export function normalizeYoutubeVideoIds(values: string[]) {
  return [...new Set(values.map((value) => value.trim()))]
    .filter((value) => VIDEO_ID_PATTERN.test(value))
    .slice(0, MAX_IDS);
}

export async function fetchYoutubePlaylistItems(
  values: string[],
  fetcher: typeof fetch = fetch,
) {
  const ids = normalizeYoutubeVideoIds(values);
  const items: YoutubePlaylistItem[] = [];

  for (let start = 0; start < ids.length; start += CONCURRENCY) {
    const batch = ids.slice(start, start + CONCURRENCY);
    const batchItems = await Promise.all(
      batch.map(async (id): Promise<YoutubePlaylistItem> => {
        try {
          const oembedUrl = new URL("https://www.youtube.com/oembed");
          oembedUrl.searchParams.set("url", `https://www.youtube.com/watch?v=${id}`);
          oembedUrl.searchParams.set("format", "json");
          const response = await fetcher(oembedUrl, {
            next: { revalidate: 86_400 },
          });

          if (!response.ok) throw new Error("YouTube oEmbed unavailable");
          const data = (await response.json()) as { title?: unknown };
          const title = typeof data.title === "string" ? data.title.trim() : "";
          return { id, title: title || "Vídeo do LegisCast" };
        } catch {
          return { id, title: "Vídeo do LegisCast" };
        }
      }),
    );
    items.push(...batchItems);
  }

  return items;
}
