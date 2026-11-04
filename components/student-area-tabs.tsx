"use client";

import Link from "next/link";

export type StudentAreaTabId = "leis" | "atalhos";
type StudentAreaTabsProps = { activeTab: StudentAreaTabId; minhasLeisHref?: string; meusAtalhosHref?: string; };
const tabClass = "border-b-2 px-4 py-3 font-black transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700";

export function StudentAreaTabs({ activeTab, minhasLeisHref = "/minhas-leis", meusAtalhosHref = "/minhas-leis?aba=atalhos" }: StudentAreaTabsProps) {
  const activeClass = "border-blue-700 text-blue-700";
  const inactiveClass = "border-transparent text-slate-600 hover:text-blue-700";
  return <div role="tablist" aria-label="Área de estudo" className="mb-6 flex gap-2 border-b border-slate-200">
    <Link href={meusAtalhosHref} role="tab" aria-selected={activeTab === "atalhos"} className={`${tabClass} ${activeTab === "atalhos" ? activeClass : inactiveClass}`}>Meus Atalhos</Link>
    <Link href={minhasLeisHref} role="tab" aria-selected={activeTab === "leis"} className={`${tabClass} ${activeTab === "leis" ? activeClass : inactiveClass}`}>Todas as leis adquiridas</Link>
  </div>;
}
