"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { getYoutubeEmbedUrl } from "@/lib/legislacoes";
import type { YoutubePlaylistItem } from "@/lib/youtube-playlist-metadata";

type LegiscastPlaylistPlayerProps = {
  playlistUrl: string;
  lawSlug: string;
  lawTitle?: string;
};

type StoredProgress = {
  version: 1;
  videoIndex: number;
  currentTime: number;
  completedVideos: number[];
  updatedAt: string;
};

type YoutubePlayer = {
  cuePlaylist: (options: PlaylistOptions) => void;
  destroy: () => void;
  getCurrentTime: () => number;
  getDuration: () => number;
  getPlaylist: () => string[] | undefined;
  getPlaylistIndex: () => number;
  loadPlaylist: (options: PlaylistOptions) => void;
  nextVideo: () => void;
  playVideo: () => void;
  playVideoAt: (index: number) => void;
  previousVideo: () => void;
};

type PlaylistOptions = {
  list: string;
  listType: "playlist";
  index: number;
  startSeconds: number;
};

type YoutubePlayerConstructor = new (
  element: HTMLElement,
  options: {
    height: string;
    width: string;
    playerVars: Record<string, number | string>;
    events: {
      onReady: () => void;
      onStateChange: (event: { data: number }) => void;
      onError: () => void;
    };
  },
) => YoutubePlayer;

type YoutubeWindow = Window &
  typeof globalThis & {
    YT?: { Player?: YoutubePlayerConstructor };
    onYouTubeIframeAPIReady?: () => void;
  };

const PROGRESS_VERSION = 1;
const MINIMUM_RESUME_SECONDS = 5;
const SAVE_INTERVAL_MS = 10_000;
const YOUTUBE_API_TIMEOUT_MS = 15_000;

let youtubeApiPromise: Promise<YoutubePlayerConstructor> | null = null;

export function getPlaylistId(value: string) {
  try {
    const url = new URL(value.trim());
    const hostname = url.hostname.replace(/^www\./, "").toLowerCase();
    const isYoutube =
      hostname === "youtube.com" ||
      hostname.endsWith(".youtube.com") ||
      hostname === "youtu.be";
    const playlistId = url.searchParams.get("list")?.trim();

    if (!isYoutube || !playlistId || !/^[A-Za-z0-9_-]+$/.test(playlistId)) {
      return null;
    }

    return playlistId;
  } catch {
    return null;
  }
}

function loadYoutubeApi() {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("YouTube API is only available in the browser."));
  }

  const youtubeWindow = window as YoutubeWindow;
  if (youtubeWindow.YT?.Player) return Promise.resolve(youtubeWindow.YT.Player);
  if (youtubeApiPromise) return youtubeApiPromise;

  youtubeApiPromise = new Promise<YoutubePlayerConstructor>((resolve, reject) => {
    const previousReadyCallback = youtubeWindow.onYouTubeIframeAPIReady;
    let settled = false;
    let readinessInterval = 0;
    let timeout = 0;

    const finish = () => {
      const Player = youtubeWindow.YT?.Player;
      if (!Player || settled) return;
      settled = true;
      window.clearInterval(readinessInterval);
      window.clearTimeout(timeout);
      resolve(Player);
    };
    const fail = () => {
      if (settled) return;
      settled = true;
      window.clearInterval(readinessInterval);
      window.clearTimeout(timeout);
      youtubeApiPromise = null;
      reject(new Error("Unable to load the YouTube IFrame API."));
    };

    youtubeWindow.onYouTubeIframeAPIReady = () => {
      previousReadyCallback?.();
      finish();
    };

    const existingScript = document.querySelector<HTMLScriptElement>(
      'script[src="https://www.youtube.com/iframe_api"]',
    );
    const script = existingScript ?? document.createElement("script");
    script.addEventListener("error", fail, { once: true });

    if (!existingScript) {
      script.src = "https://www.youtube.com/iframe_api";
      script.async = true;
      document.head.appendChild(script);
    }

    readinessInterval = window.setInterval(finish, 100);
    timeout = window.setTimeout(fail, YOUTUBE_API_TIMEOUT_MS);
    finish();
  });

  return youtubeApiPromise;
}

export function parseStoredProgress(rawValue: string | null): StoredProgress | null {
  try {
    if (!rawValue) return null;

    const value: unknown = JSON.parse(rawValue);
    if (!value || typeof value !== "object") return null;

    const candidate = value as Partial<StoredProgress>;
    if (
      candidate.version !== PROGRESS_VERSION ||
      !Number.isInteger(candidate.videoIndex) ||
      (candidate.videoIndex ?? -1) < 0 ||
      typeof candidate.currentTime !== "number" ||
      !Number.isFinite(candidate.currentTime) ||
      candidate.currentTime < 0 ||
      !Array.isArray(candidate.completedVideos) ||
      candidate.completedVideos.some(
        (index) => !Number.isInteger(index) || index < 0,
      ) ||
      typeof candidate.updatedAt !== "string" ||
      !Number.isFinite(Date.parse(candidate.updatedAt))
    ) {
      return null;
    }

    return {
      version: PROGRESS_VERSION,
      videoIndex: candidate.videoIndex,
      currentTime: candidate.currentTime,
      completedVideos: [...new Set(candidate.completedVideos)].sort(
        (a, b) => a - b,
      ),
      updatedAt: candidate.updatedAt,
    } as StoredProgress;
  } catch {
    return null;
  }
}

function readStoredProgress(storageKey: string): StoredProgress | null {
  try {
    return parseStoredProgress(window.localStorage.getItem(storageKey));
  } catch {
    return null;
  }
}

function formatTime(seconds: number) {
  const wholeSeconds = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(wholeSeconds / 60);
  const remainder = wholeSeconds % 60;
  return `${minutes}:${remainder.toString().padStart(2, "0")}`;
}

function ConventionalYoutubeEmbed({ src, title }: { src: string; title: string }) {
  const embedUrl = getYoutubeEmbedUrl(src);
  if (!embedUrl) return null;

  return (
    <div className="w-full min-w-0 overflow-hidden rounded-lg border border-slate-700 bg-black shadow-[0_18px_45px_rgba(0,0,0,0.28)]">
      <iframe
        className="aspect-video w-full max-w-full bg-black"
        src={embedUrl}
        title={title}
        loading="lazy"
        referrerPolicy="strict-origin-when-cross-origin"
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
        allowFullScreen
      />
    </div>
  );
}

export function LegiscastPlaylistPlayer({
  playlistUrl,
  lawSlug,
  lawTitle,
}: LegiscastPlaylistPlayerProps) {
  const playlistId = useMemo(() => getPlaylistId(playlistUrl), [playlistUrl]);
  const storageKey = playlistId
    ? `legiscast-progress:${lawSlug}:${playlistId}`
    : null;
  const playerElementRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<YoutubePlayer | null>(null);
  const persistProgressRef = useRef<() => void>(() => undefined);
  const currentIndexRef = useRef(0);
  const currentTimeRef = useRef(0);
  const completedVideosRef = useRef<number[]>([]);
  const activePlaylistItemRef = useRef<HTMLButtonElement>(null);
  const isPlayingRef = useRef(false);
  const suppressPersistenceRef = useRef(false);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [currentIndex, setCurrentIndex] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [totalVideos, setTotalVideos] = useState(0);
  const [videoIds, setVideoIds] = useState<string[]>([]);
  const [playlistItems, setPlaylistItems] = useState<YoutubePlaylistItem[]>([]);
  const [playlistItemsStatus, setPlaylistItemsStatus] = useState<
    "idle" | "loading" | "ready"
  >("idle");
  const [savedProgress, setSavedProgress] = useState<StoredProgress | null>(null);
  const headingId = useId();

  useEffect(() => {
    if (!playlistId || !storageKey || !playerElementRef.current) return;

    let cancelled = false;
    let updateInterval: number | undefined;
    let lastPersistedAt = 0;
    const initialProgress = readStoredProgress(storageKey);
    completedVideosRef.current = initialProgress?.completedVideos ?? [];
    suppressPersistenceRef.current = initialProgress === null;
    setSavedProgress(initialProgress);
    setStatus("loading");
    setCurrentIndex(0);
    setCurrentTime(0);
    setDuration(0);
    setTotalVideos(0);
    setVideoIds([]);
    setPlaylistItems([]);
    setPlaylistItemsStatus("idle");

    const syncPlayerState = () => {
      const player = playerRef.current;
      if (!player) return;

      try {
        const nextIndex = Math.max(0, player.getPlaylistIndex() || 0);
        const nextTime = Math.max(0, player.getCurrentTime() || 0);
        const nextDuration = Math.max(0, player.getDuration() || 0);
        const nextPlaylist = player.getPlaylist() ?? [];
        const nextTotal = nextPlaylist.length;
        currentIndexRef.current = nextIndex;
        currentTimeRef.current = nextTime;
        setCurrentIndex(nextIndex);
        setCurrentTime(nextTime);
        setDuration(nextDuration);
        setTotalVideos(nextTotal);
        setVideoIds((current) =>
          current.length === nextPlaylist.length &&
          current.every((id, index) => id === nextPlaylist[index])
            ? current
            : [...nextPlaylist],
        );
      } catch {
        // The player can be temporarily unavailable between playlist videos.
      }
    };

    const persistProgress = () => {
      if (suppressPersistenceRef.current || !playerRef.current) return;
      syncPlayerState();

      const progress: StoredProgress = {
        version: PROGRESS_VERSION,
        videoIndex: currentIndexRef.current,
        currentTime: currentTimeRef.current,
        completedVideos: completedVideosRef.current,
        updatedAt: new Date().toISOString(),
      };

      try {
        window.localStorage.setItem(storageKey, JSON.stringify(progress));
        lastPersistedAt = Date.now();
      } catch {
        // Storage can be unavailable due to browser privacy policy.
      }
    };
    persistProgressRef.current = persistProgress;

    loadYoutubeApi()
      .then((Player) => {
        if (cancelled || !playerElementRef.current) return;

        const mountElement = document.createElement("div");
        mountElement.className = "h-full w-full";
        playerElementRef.current.replaceChildren(mountElement);

        playerRef.current = new Player(mountElement, {
          height: "100%",
          width: "100%",
          playerVars: {
            autoplay: 0,
            controls: 1,
            list: playlistId,
            listType: "playlist",
            loop: 0,
            playsinline: 1,
            rel: 0,
          },
          events: {
            onReady: () => {
              if (cancelled) return;
              syncPlayerState();
              setStatus("ready");
            },
            onStateChange: ({ data }) => {
              if (cancelled) return;
              const previousIndex = currentIndexRef.current;
              syncPlayerState();

              if (data === 0) {
                completedVideosRef.current = [
                  ...new Set([...completedVideosRef.current, currentIndexRef.current]),
                ].sort((a, b) => a - b);
                persistProgress();
              } else if (data === 1) {
                suppressPersistenceRef.current = false;
                isPlayingRef.current = true;
                setSavedProgress(null);
              } else if (data === 2) {
                isPlayingRef.current = false;
                persistProgress();
              }

              if (currentIndexRef.current !== previousIndex) persistProgress();
            },
            onError: () => {
              if (cancelled) return;
              if (updateInterval) {
                window.clearInterval(updateInterval);
                updateInterval = undefined;
              }
              try {
                playerRef.current?.destroy();
              } catch {
                // O fallback convencional assume o lugar do player da API.
              }
              playerRef.current = null;
              setStatus("error");
            },
          },
        });

        updateInterval = window.setInterval(() => {
          syncPlayerState();
          if (
            isPlayingRef.current &&
            Date.now() - lastPersistedAt >= SAVE_INTERVAL_MS
          ) {
            persistProgress();
          }
        }, 1_000);
      })
      .catch(() => {
        if (!cancelled) setStatus("error");
      });

    return () => {
      cancelled = true;
      if (updateInterval) window.clearInterval(updateInterval);
      try {
        persistProgress();
        playerRef.current?.destroy();
      } catch {
        // The iframe may already have been removed during App Router navigation.
      }
      playerRef.current = null;
      persistProgressRef.current = () => undefined;
      isPlayingRef.current = false;
    };
  }, [playlistId, storageKey]);

  useEffect(() => {
    if (!videoIds.length) return;

    const controller = new AbortController();
    setPlaylistItemsStatus("loading");
    fetch(`/api/youtube/playlist-items?ids=${encodeURIComponent(videoIds.join(","))}`, {
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) throw new Error("Playlist metadata unavailable");
        return (await response.json()) as { items?: YoutubePlaylistItem[] };
      })
      .then(({ items }) => {
        if (controller.signal.aborted) return;
        const titlesById = new Map((items ?? []).map((item) => [item.id, item.title]));
        setPlaylistItems(
          videoIds.map((id) => ({
            id,
            title: titlesById.get(id) || "Vídeo do LegisCast",
          })),
        );
        setPlaylistItemsStatus("ready");
      })
      .catch(() => {
        if (controller.signal.aborted) return;
        setPlaylistItems(
          videoIds.map((id) => ({ id, title: "Vídeo do LegisCast" })),
        );
        setPlaylistItemsStatus("ready");
      });

    return () => controller.abort();
  }, [videoIds]);

  useEffect(() => {
    activePlaylistItemRef.current?.scrollIntoView({
      behavior: "smooth",
      block: "nearest",
    });
  }, [currentIndex]);

  const safeTotalVideos = Math.max(totalVideos, 0);
  const isFirstVideo = currentIndex <= 0;
  const isLastVideo =
    safeTotalVideos > 0 && currentIndex >= safeTotalVideos - 1;
  const lessonProgress = duration > 0 ? (currentTime / duration) * 100 : 0;
  const playlistProgress =
    safeTotalVideos > 0 ? ((currentIndex + 1) / safeTotalVideos) * 100 : 0;
  const savedPlaylistIsComplete =
    safeTotalVideos > 0 &&
    savedProgress?.completedVideos.filter((index) => index < safeTotalVideos)
      .length === safeTotalVideos;
  const canResume =
    status === "ready" &&
    savedProgress !== null &&
    savedProgress.currentTime >= MINIMUM_RESUME_SECONDS &&
    savedProgress.videoIndex < safeTotalVideos &&
    !savedPlaylistIsComplete;
  const accessibleTitle = `LegisCast${lawTitle ? `: ${lawTitle}` : ""}`;

  if (!playlistId) {
    return (
      <section className="min-w-0 space-y-5" aria-labelledby={headingId}>
        <div className="space-y-2">
          <h2 id={headingId} className="text-3xl font-black text-[#062a5f]">
            <span aria-hidden="true">🎧 </span>LegisCast
          </h2>
          <p className="text-base leading-7 text-slate-600">
            Ouça esta legislação enquanto acompanha o texto legal.
          </p>
        </div>
        <ConventionalYoutubeEmbed src={playlistUrl} title={accessibleTitle} />
      </section>
    );
  }

  const openPlaylistUrl = `https://www.youtube.com/playlist?list=${encodeURIComponent(playlistId)}`;

  return (
    <section className="min-w-0 space-y-5" aria-labelledby={headingId}>
      <div className="space-y-2">
        <h2 id={headingId} className="text-3xl font-black text-[#062a5f]">
          <span aria-hidden="true">🎧 </span>LegisCast
        </h2>
        <p className="text-base leading-7 text-slate-600">
          Ouça e compreenda esta lei por partes.
        </p>
      </div>

      <div className="overflow-hidden rounded-2xl border border-blue-100 bg-white shadow-[0_18px_50px_rgba(15,23,42,0.08)]">
        <div className="relative grid min-w-0 lg:grid-cols-[minmax(0,2fr)_minmax(17rem,1fr)]">
          <div className="relative aspect-video min-w-0 overflow-hidden bg-slate-950">
            {status === "error" ? (
              <ConventionalYoutubeEmbed src={playlistUrl} title={accessibleTitle} />
            ) : (
              <>
                <div ref={playerElementRef} className="absolute inset-0 h-full w-full" />
                {status === "loading" ? (
                  <div
                    className="absolute inset-0 flex animate-pulse items-center justify-center bg-slate-900"
                    role="status"
                  >
                    <span className="rounded-full bg-slate-800 px-4 py-2 text-sm font-semibold text-slate-300">
                      Carregando LegisCast…
                    </span>
                  </div>
                ) : null}
              </>
            )}
          </div>

          {status !== "error" ? (
            <aside
              className="min-w-0 border-t border-blue-100 bg-slate-50 lg:absolute lg:inset-y-0 lg:right-0 lg:flex lg:min-h-0 lg:w-1/3 lg:flex-col lg:border-l lg:border-t-0"
              aria-labelledby={`${headingId}-playlist`}
            >
              <h3
                id={`${headingId}-playlist`}
                className="shrink-0 border-b border-blue-100 bg-white px-4 py-3 text-base font-black text-[#062a5f]"
              >
                Aulas desta playlist
              </h3>
              <div className="max-h-80 overflow-y-auto overscroll-contain p-2 lg:min-h-0 lg:flex-1 lg:max-h-none">
                {playlistItemsStatus !== "ready" ? (
                  <p className="px-3 py-4 text-sm text-slate-500" role="status">
                    Carregando aulas…
                  </p>
                ) : (
                  <ul className="space-y-1">
                    {playlistItems.map((item, index) => {
                      const isCurrent = index === currentIndex;
                      return (
                        <li key={item.id}>
                          <button
                            ref={isCurrent ? activePlaylistItemRef : undefined}
                            type="button"
                            aria-current={isCurrent ? "true" : undefined}
                            onClick={() => {
                              if (!playerRef.current || index === currentIndex) return;
                              suppressPersistenceRef.current = false;
                              persistProgressRef.current();
                              currentIndexRef.current = index;
                              currentTimeRef.current = 0;
                              setCurrentIndex(index);
                              setCurrentTime(0);
                              playerRef.current.playVideoAt(index);
                            }}
                            className={`flex min-h-12 w-full min-w-0 items-start justify-between gap-3 rounded-lg border px-3 py-2.5 text-left text-sm leading-5 transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500 ${
                              isCurrent
                                ? "border-blue-200 bg-blue-50 font-bold text-[#062a5f]"
                                : "border-transparent text-slate-700 hover:border-blue-100 hover:bg-white"
                            }`}
                          >
                            <span className="min-w-0 break-words">{item.title}</span>
                            {isCurrent ? (
                              <span className="shrink-0 rounded-full bg-blue-100 px-2 py-0.5 text-[0.65rem] font-black uppercase tracking-wide text-blue-700">
                                Reproduzindo
                              </span>
                            ) : null}
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            </aside>
          ) : null}
        </div>

        <div className="space-y-5 p-5 sm:p-6">
          {status === "error" ? (
            <p className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
              Os controles de progresso não puderam ser carregados. A playlist
              continua disponível no player convencional.
            </p>
          ) : null}

          {canResume ? (
            <div className="flex flex-col gap-3 rounded-xl border border-blue-200 bg-blue-50 p-4 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm font-semibold text-[#062a5f]">
                Você parou na Aula {savedProgress.videoIndex + 1}, em{" "}
                {formatTime(savedProgress.currentTime)}.
              </p>
              <button
                type="button"
                onClick={() => {
                  playerRef.current?.loadPlaylist({
                    list: playlistId,
                    listType: "playlist",
                    index: savedProgress.videoIndex,
                    startSeconds: savedProgress.currentTime,
                  });
                  playerRef.current?.playVideo();
                  setSavedProgress(null);
                }}
                className="inline-flex min-h-10 shrink-0 items-center justify-center rounded-lg bg-[#062a5f] px-4 py-2 text-sm font-bold text-white transition hover:bg-blue-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500"
              >
                Continuar de onde parei
              </button>
            </div>
          ) : null}

          <div className="space-y-2" aria-live="polite">
            <div className="flex items-center justify-between gap-4 text-sm font-bold text-[#062a5f]">
              <span>
                {safeTotalVideos > 0
                  ? `Aula ${currentIndex + 1} de ${safeTotalVideos}`
                  : "Preparando aulas…"}
              </span>
              {duration > 0 ? (
                <span className="font-semibold text-slate-500">
                  {formatTime(currentTime)} / {formatTime(duration)}
                </span>
              ) : null}
            </div>
            <div
              className="h-2.5 overflow-hidden rounded-full bg-slate-200"
              role="progressbar"
              aria-label="Progresso na playlist"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.round(playlistProgress)}
            >
              <div
                className="h-full rounded-full bg-blue-700 transition-[width] duration-300"
                style={{ width: `${Math.min(100, playlistProgress)}%` }}
              />
            </div>
            <div
              className="h-1 overflow-hidden rounded-full bg-slate-100"
              aria-label="Progresso da aula atual"
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.round(lessonProgress)}
            >
              <div
                className="h-full bg-blue-300 transition-[width] duration-300"
                style={{ width: `${Math.min(100, lessonProgress)}%` }}
              />
            </div>
          </div>

          <div className="grid gap-3 min-[420px]:grid-cols-2">
            <button
              type="button"
              onClick={() => {
                suppressPersistenceRef.current = false;
                persistProgressRef.current();
                playerRef.current?.previousVideo();
              }}
              disabled={status !== "ready" || isFirstVideo}
              className="inline-flex min-h-11 items-center justify-center rounded-lg border border-blue-200 bg-white px-4 py-2.5 text-sm font-bold text-[#062a5f] transition hover:border-blue-300 hover:bg-blue-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500 disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-50 disabled:text-slate-400"
            >
              ← Aula anterior
            </button>
            <button
              type="button"
              onClick={() => {
                suppressPersistenceRef.current = false;
                persistProgressRef.current();
                playerRef.current?.nextVideo();
              }}
              disabled={status !== "ready" || isLastVideo || safeTotalVideos === 0}
              className="inline-flex min-h-11 items-center justify-center rounded-lg bg-[#062a5f] px-4 py-2.5 text-sm font-bold text-white transition hover:bg-blue-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-500"
            >
              Próxima aula →
            </button>
          </div>

          <div className="flex flex-col gap-3 text-sm sm:flex-row sm:items-center sm:justify-between">
            <p className="text-slate-500">
              As aulas são reproduzidas na ordem da playlist.
            </p>
            <button
              type="button"
              disabled={status !== "ready"}
              onClick={() => {
                if (!window.confirm("Recomeçar esta playlist e apagar o progresso salvo?")) {
                  return;
                }

                try {
                  window.localStorage.removeItem(
                    `legiscast-progress:${lawSlug}:${playlistId}`,
                  );
                } catch {
                  // O player ainda pode recomeçar quando o storage está bloqueado.
                }
                suppressPersistenceRef.current = true;
                completedVideosRef.current = [];
                currentIndexRef.current = 0;
                currentTimeRef.current = 0;
                setSavedProgress(null);
                setCurrentIndex(0);
                setCurrentTime(0);
                playerRef.current?.cuePlaylist({
                  list: playlistId,
                  listType: "playlist",
                  index: 0,
                  startSeconds: 0,
                });
              }}
              className="w-fit font-semibold text-slate-500 underline decoration-slate-300 underline-offset-4 transition hover:text-[#062a5f] focus-visible:rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500 disabled:cursor-not-allowed disabled:text-slate-300"
            >
              Recomeçar playlist
            </button>
          </div>

          <a
            href={openPlaylistUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex min-h-10 items-center text-sm font-bold text-blue-700 underline decoration-blue-200 underline-offset-4 transition hover:text-blue-900 focus-visible:rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500"
          >
            Abrir playlist no YouTube
          </a>
        </div>
      </div>
    </section>
  );
}
