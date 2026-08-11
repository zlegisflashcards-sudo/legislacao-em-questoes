"use client";

import { useMemo, useState } from "react";
import {
  getLegislacaoEmbedUrl,
  isLegislacaoUrlValida,
} from "@/lib/legislacao-embed";

type ContentTabId = "esquematizada" | "legiscast" | "questoes";

type ContentTab = {
  id: ContentTabId;
  label: string;
  icon: string;
  title: string;
  src?: string;
};

type LegislacaoContentTabsProps = {
  questoesUrl: string;
  legiscastUrl?: string;
  esquematizadaUrl?: string;
  legislacaoNome: string;
};

type LegislacaoEmbedProps = {
  src?: string;
  title: string;
  variant?: "document" | "video";
  restrictDocumentActions?: boolean;
};

function hideNativePdfControls(url: string) {
  try {
    const parsedUrl = new URL(url);
    if (!parsedUrl.pathname.toLowerCase().endsWith(".pdf")) return url;
    parsedUrl.hash = "toolbar=0&navpanes=0";
    return parsedUrl.toString();
  } catch {
    return url;
  }
}

export function LegislacaoEmbed({
  src,
  title,
  variant = "document",
  restrictDocumentActions = false,
}: LegislacaoEmbedProps) {
  const normalizedUrl =
    variant === "document" ? getLegislacaoEmbedUrl(src) : src?.trim() ?? "";
  const embedUrl =
    variant === "document" && restrictDocumentActions
      ? hideNativePdfControls(normalizedUrl)
      : normalizedUrl;
  const exibirTelaCheia =
    variant === "document" &&
    !restrictDocumentActions &&
    isLegislacaoUrlValida(embedUrl);

  if (!embedUrl) return null;

  return (
    <div className="w-full min-w-0 space-y-3">
      <div
        className={`w-full min-w-0 overflow-hidden rounded-lg border border-slate-700 bg-black shadow-[0_18px_45px_rgba(0,0,0,0.28)] ${
          restrictDocumentActions ? "select-none" : ""
        }`}
        onContextMenu={
          restrictDocumentActions ? (event) => event.preventDefault() : undefined
        }
      >
        <iframe
          className={
            variant === "document"
              ? "h-[72vh] min-h-[520px] w-full max-w-full bg-white sm:min-h-[620px]"
              : "aspect-video w-full max-w-full bg-black"
          }
          src={embedUrl}
          title={title}
          loading="lazy"
          referrerPolicy="strict-origin-when-cross-origin"
          allow={
            variant === "video"
              ? "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
              : undefined
          }
          allowFullScreen
        />
      </div>

      {exibirTelaCheia ? (
        <div className="flex justify-end">
          <a
            href={embedUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex min-h-10 items-center justify-center rounded-lg border border-blue-200 bg-white px-4 py-2 text-sm font-bold text-[#062a5f] shadow-sm transition hover:border-blue-300 hover:bg-blue-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500"
          >
            Abrir PDF em tela cheia
          </a>
        </div>
      ) : null}
    </div>
  );
}

export function LegislacaoContentTabs({
  questoesUrl,
  legiscastUrl,
  esquematizadaUrl,
  legislacaoNome,
}: LegislacaoContentTabsProps) {
  const tabs = useMemo<ContentTab[]>(
    () => [
      {
        id: "questoes",
        label: "Legislação em Questões",
        icon: "🎯",
        title: `Vídeo com questões dos flashcards: ${legislacaoNome}`,
        src: questoesUrl,
      },
      {
        id: "legiscast",
        label: "Legiscast",
        icon: "🎧",
        title: `Legiscast: ${legislacaoNome}`,
        src: legiscastUrl,
      },
      {
        id: "esquematizada",
        label: "Legislação Esquematizada",
        icon: "📄",
        title: `Legislação esquematizada: ${legislacaoNome}`,
        src: esquematizadaUrl,
      },
    ],
    [esquematizadaUrl, legiscastUrl, legislacaoNome, questoesUrl],
  );

  const [activeTabId, setActiveTabId] = useState<ContentTabId>("questoes");
  const activeTab = tabs.find((tab) => tab.id === activeTabId) ?? tabs[0];
  const isDocumentTab = activeTab.id === "esquematizada";

  return (
    <section className="space-y-4">
      <div key={activeTab.id}>
        {activeTab.src ? (
          <LegislacaoEmbed
            src={activeTab.src}
            title={activeTab.title}
            variant={isDocumentTab ? "document" : "video"}
          />
        ) : (
          <div className="flex h-[360px] items-center justify-center bg-slate-950 px-6 text-center text-sm font-semibold text-slate-300">
            Material ainda não disponível.
          </div>
        )}
      </div>

      <div className="grid w-full gap-2 sm:grid-cols-3">
        {tabs.map((tab) => {
          const isActive = tab.id === activeTab.id;
          const isAvailable = Boolean(tab.src);

          return (
            <button
              key={tab.id}
              type="button"
              disabled={!isAvailable}
              onClick={() => setActiveTabId(tab.id)}
              className={[
                "inline-flex w-full items-center justify-center gap-3 rounded-lg px-4 py-3 text-sm font-bold transition",
                isActive
                  ? "bg-[#062a5f] text-white shadow-lg ring-1 ring-blue-300/30"
                  : "bg-white text-slate-800 hover:bg-blue-50 hover:text-[#062a5f]",
                !isAvailable ? "cursor-not-allowed opacity-50" : "",
              ].join(" ")}
            >
              <span className="text-2xl leading-none" aria-hidden="true">
                {tab.icon}
              </span>
              {tab.label}
            </button>
          );
        })}
      </div>
    </section>
  );
}
