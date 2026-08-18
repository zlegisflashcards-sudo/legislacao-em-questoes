"use client";

import { useId, useState, type ReactNode } from "react";

export type LegisBotStudyTab = "legisbot" | "community" | "highlights";

type LegisBotStudyTabsProps = {
  slug: string;
  ordem: string;
  legisBotContent: ReactNode;
  communityContent: ReactNode;
  highlightsContent: ReactNode;
  communityCount: number;
  onActiveTabChange?: (tab: LegisBotStudyTab) => void;
};

export default function LegisBotStudyTabs({
  slug,
  ordem,
  legisBotContent,
  communityContent,
  highlightsContent,
  communityCount,
  onActiveTabChange,
}: LegisBotStudyTabsProps) {
  const [activeTab, setActiveTab] = useState<LegisBotStudyTab>("legisbot");
  const [openedTabs, setOpenedTabs] = useState<Set<LegisBotStudyTab>>(() => new Set(["legisbot"]));
  const id = useId().replace(/:/g, "");

  const tabs: Array<{ key: LegisBotStudyTab; icon: string; label: string; content: ReactNode }> = [
    { key: "legisbot", icon: "🤖", label: "LegisBot", content: legisBotContent },
    { key: "community", icon: "💬", label: "Comunidade", content: communityContent },
    { key: "highlights", icon: "🖍️", label: "Destaques", content: highlightsContent },
  ];

  function selectTab(tab: LegisBotStudyTab) {
    setOpenedTabs((current) => new Set(current).add(tab));
    setActiveTab(tab);
    onActiveTabChange?.(tab);
  }

  return (
    <section className="legisbot-study-tabs" data-slug={slug} data-ordem={ordem}>
      <div className="legisbot-tab-list" role="tablist" aria-label="Recursos de estudo do artigo">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            id={`${id}-${tab.key}-tab`}
            type="button"
            role="tab"
            aria-selected={activeTab === tab.key}
            aria-controls={`${id}-${tab.key}-panel`}
            className={activeTab === tab.key ? "active" : ""}
            onClick={() => selectTab(tab.key)}
          >
            <span aria-hidden="true">{tab.icon}</span>
            <span>{tab.label}</span>
            {tab.key === "community" ? (
              <span className="legisbot-tab-count" aria-label={`${communityCount} contribuições públicas`}>
                {communityCount}
              </span>
            ) : null}
          </button>
        ))}
      </div>

      {tabs.map((tab) => openedTabs.has(tab.key) ? (
        <div
          key={tab.key}
          id={`${id}-${tab.key}-panel`}
          className="legisbot-tab-panel"
          role="tabpanel"
          aria-labelledby={`${id}-${tab.key}-tab`}
          hidden={activeTab !== tab.key}
        >
          {tab.content}
        </div>
      ) : null)}
    </section>
  );
}
