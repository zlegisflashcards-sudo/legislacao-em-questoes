import { NextResponse } from "next/server";
import {
  fetchYoutubePlaylistItems,
  normalizeYoutubeVideoIds,
} from "@/lib/youtube-playlist-metadata";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const ids = normalizeYoutubeVideoIds(
    new URL(request.url).searchParams.get("ids")?.split(",") ?? [],
  );

  if (!ids.length) {
    return NextResponse.json(
      { items: [] },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }

  const items = await fetchYoutubePlaylistItems(ids);
  return NextResponse.json(
    { items },
    {
      headers: {
        "Cache-Control": "public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800",
      },
    },
  );
}
