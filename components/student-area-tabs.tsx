"use client";

import Link from "next/link";

export type StudentAreaTabId = "leis" | "edital";

type StudentAreaTabsProps = {
  activeTab: StudentAreaTabId;
  onTabChange?: (tab: StudentAreaTabId) => void;
  minhasLeisHref?: string;
};

const tabClass = "border-b-2 px-4 py-3 font-black transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700";

export function StudentAreaTabs({ activeTab, onTabChange, minhasLeisHref }: StudentAreaTabsProps) {
  const activeClass = "border-blue-700 text-blue-700";
  const inactiveClass = "border-transparent text-slate-600 hover:text-blue-700";

  return <div role="tablist" aria-label="Área de estudo" className="mb-6 flex gap-2 border-b border-slate-200">
    {minhasLeisHref ? <Link href={minhasLeisHref} role="tab" aria-selected={activeTab === "leis"} className={`${tabClass} ${activeTab === "leis" ? activeClass : inactiveClass}`}>Minhas leis</Link> : <button type="button" role="tab" aria-selected={activeTab === "leis"} aria-controls="student-laws-panel" onClick={() => onTabChange?.("leis")} className={`${tabClass} ${activeTab === "leis" ? activeClass : inactiveClass}`}>Minhas leis</button>}
    {onTabChange ? <button type="button" role="tab" aria-selected={activeTab === "edital"} aria-controls="student-exam-panel" onClick={() => onTabChange("edital")} className={`${tabClass} ${activeTab === "edital" ? activeClass : inactiveClass}`}>Meu edital</button> : <button type="button" role="tab" aria-selected={false} disabled title="Meu edital em preparação" className={`${tabClass} ${inactiveClass} cursor-default disabled:opacity-100`}>Meu edital <span className="ml-1 text-[10px] uppercase tracking-wide">Em breve</span></button>}
  </div>;
}
