"use client";

import { useMemo, useState } from "react";

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
      <div className="overflow-hidden rounded-lg border border-slate-700 bg-black shadow-[0_18px_45px_rgba(0,0,0,0.28)]">
        {activeTab.src ? (
          <iframe
            key={activeTab.id}
            className={
              isDocumentTab
                ? "h-[72vh] min-h-[520px] w-full bg-white"
                : "aspect-video w-full bg-black"
            }
            src={activeTab.src}
            title={activeTab.title}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
            allowFullScreen
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
