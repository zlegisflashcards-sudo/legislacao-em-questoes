"use client";

import Link from "next/link";
import { StudentShortcutsClient } from "@/components/student-shortcuts-client";

type Tab = "library" | "shortcuts";
type Props = { loading: boolean; error: string; onRetry(): void; library?: React.ReactNode; tab: Tab; onTabChange(tab: Tab): void };

/**
 * Uma lei canônica segue sendo a mesma compra/campanha. O recorte é levado na
 * URL somente como contexto de edital, para nunca criar ou resetar campanha.
 */
export function StudentStudyHub({ loading, error, onRetry, library, tab, onTabChange }: Props) {
  return <main className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 sm:py-8">
    <header className="flex flex-wrap items-start justify-between gap-4">
      <div><p className="text-xs font-black uppercase tracking-[.16em] text-blue-700">Biblioteca de Flashcards</p><p className="mt-2 max-w-2xl text-sm text-slate-600 sm:text-base">Acesse suas leis e mantenha seus atalhos de estudo sempre à mão.</p></div>
      <Link href="/recordes" className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-amber-300 bg-amber-50 px-4 py-2 font-black text-amber-900 hover:bg-amber-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-600"><span aria-hidden="true">🏆</span>Sala de Records</Link>
    </header>

    <div role="tablist" aria-label="Meus Estudos" className="mt-7 flex gap-2 border-b border-slate-200">
      <button type="button" role="tab" aria-selected={tab === "shortcuts"} onClick={() => onTabChange("shortcuts")} className={`min-h-11 border-b-2 px-4 font-black ${tab === "shortcuts" ? "border-blue-700 text-blue-700" : "border-transparent text-slate-600 hover:text-blue-700"}`}>Meus Atalhos</button>
      <button type="button" role="tab" aria-selected={tab === "library"} onClick={() => onTabChange("library")} className={`min-h-11 border-b-2 px-4 font-black ${tab === "library" ? "border-blue-700 text-blue-700" : "border-transparent text-slate-600 hover:text-blue-700"}`}>Todas as leis adquiridas</button>
    </div>

    {tab === "library" ? <>{loading ? <p role="status" className="mt-6 rounded-2xl border border-blue-100 bg-white p-8 text-slate-600 shadow-sm">Carregando suas leis.</p> : null}{!loading && error ? <div role="alert" className="mt-6 rounded-2xl border border-red-200 bg-white p-8 text-red-700 shadow-sm"><p>{error}</p><button type="button" onClick={onRetry} className="mt-4 rounded-xl bg-blue-700 px-5 py-3 font-black text-white">Tentar novamente</button></div> : null}{!loading && !error ? library : null}</> : null}
    {tab === "shortcuts" ? <div role="tabpanel" aria-label="Meus Atalhos" className="mt-6"><StudentShortcutsClient embedded /></div> : null}
  </main>;
}
