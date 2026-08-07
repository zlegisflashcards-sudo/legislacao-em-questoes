export type AnkiPlatformId = "computador" | "android" | "ios" | "navegador";

export type AnkiPlatformTutorial = {
  label: string;
  videoUrl: string | null;
};

export const ANKI_PLATFORM_TUTORIALS: Record<AnkiPlatformId, AnkiPlatformTutorial> = {
  computador: { label: "Computador", videoUrl: null },
  android: { label: "Android", videoUrl: null },
  ios: { label: "iOS", videoUrl: null },
  navegador: { label: "Navegador", videoUrl: null },
};

export const ANKI_PLATFORM_IDS = Object.keys(ANKI_PLATFORM_TUTORIALS) as AnkiPlatformId[];
export const DEFAULT_ANKI_PLATFORM: AnkiPlatformId = "computador";
export const ANKI_SETUP_STORAGE_PREFIX = "legisflashcards:anki-configured:";

type AnkiLocalStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

export function ankiSetupStorageKey(userId: string) {
  return `${ANKI_SETUP_STORAGE_PREFIX}${userId}`;
}

export function readAnkiConfigured(storage: AnkiLocalStorage, userId: string) {
  try {
    return storage.getItem(ankiSetupStorageKey(userId)) === "true";
  } catch {
    return false;
  }
}

export function markAnkiConfigured(storage: AnkiLocalStorage, userId: string) {
  try {
    storage.setItem(ankiSetupStorageKey(userId), "true");
    return true;
  } catch {
    return false;
  }
}

export function clearAnkiConfigured(storage: AnkiLocalStorage, userId: string) {
  try {
    storage.removeItem(ankiSetupStorageKey(userId));
    return true;
  } catch {
    return false;
  }
}

export function getAnkiYoutubeEmbedUrl(value: string | null) {
  if (!value) return null;

  try {
    const url = new URL(value);
    if (url.protocol !== "https:") return null;

    const hostname = url.hostname.toLowerCase();
    let videoId: string | null = null;

    if (hostname === "youtu.be") {
      videoId = url.pathname.split("/").filter(Boolean)[0] ?? null;
    } else if (hostname === "youtube.com" || hostname === "www.youtube.com") {
      if (url.pathname === "/watch") videoId = url.searchParams.get("v");
      if (url.pathname.startsWith("/embed/")) videoId = url.pathname.split("/").filter(Boolean)[1] ?? null;
    }

    if (!videoId || !/^[A-Za-z0-9_-]{11}$/.test(videoId)) return null;
    return `https://www.youtube-nocookie.com/embed/${videoId}`;
  } catch {
    return null;
  }
}
