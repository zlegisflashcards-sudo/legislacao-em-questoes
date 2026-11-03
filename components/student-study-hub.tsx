"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { LawStudyPageClient } from "@/components/law-study-page-client";
import { StudentExamClient } from "@/components/student-exam-client";
import type { StudentExamLaw } from "@/lib/student-exams";
import { filterStudentLaws, studentLawMotherTitle, type StudentLaw } from "@/lib/student-laws";

type Props = { laws: StudentLaw[]; loading: boolean; error: string; onRetry(): void; library?: React.ReactNode; studyRequester?: (path: string, method?: string) => Promise<unknown>; examRequester?: (path: string, init?: RequestInit) => Promise<Pick<Response, "ok" | "status" | "json">> };
type Tab = "active" | "library";

const keyOf = (law: StudentLaw) => `${law.id}:${law.studyContextId ?? "completa"}`;
const lastStudyKey = "legisflashcards:last-study-key";

// Mantido para compatibilidade com URLs salvas de versões anteriores do hub.
export function resolveActiveStudyKey(laws: StudentLaw[], fromUrl: string | null, saved: string | null) {
  return [fromUrl, saved].find((candidate) => candidate && laws.some((law) => keyOf(law) === candidate)) ?? null;
}

/**
 * Uma lei canônica segue sendo a mesma compra/campanha. O recorte é levado na
 * URL somente como contexto de edital, para nunca criar ou resetar campanha.
 */
export function StudentStudyHub({ laws, loading, error, onRetry, library, studyRequester, examRequester }: Props) {
  const [tab, setTab] = useState<Tab>("active");
  const [query, setQuery] = useState("");
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [selectedScopeId, setSelectedScopeId] = useState<string | null>(null);
  const shown = useMemo(() => filterStudentLaws(laws, query), [laws, query]);

  useEffect(() => {
    const fromUrl = new URLSearchParams(window.location.search).get("estudo");
    const saved = window.localStorage.getItem(lastStudyKey);
    setSelectedKey(resolveActiveStudyKey(laws, fromUrl, saved));
  }, [laws]);

  function selectExamLaw(examLaw: StudentExamLaw) {
    const matching = laws.find((law) => law.id === examLaw.id);
    if (!matching) return;
    const key = keyOf(matching);
    setSelectedKey(key);
    window.localStorage.setItem(lastStudyKey, key);
    setSelectedScopeId(examLaw.recorteId);
  }
  const selected = laws.find((law) => keyOf(law) === selectedKey) ?? null;

  return <main className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 sm:py-8">
    <header className="flex flex-wrap items-start justify-between gap-4">
      <div><p className="text-xs font-black uppercase tracking-[.16em] text-blue-700">Biblioteca de Flashcards</p><p className="mt-2 max-w-2xl text-sm text-slate-600 sm:text-base">Organize seu estudo da lei seca no seu edital personalizado e escolha uma lei para continuar sua preparação.</p></div>
      <Link href="/recordes" className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-amber-300 bg-amber-50 px-4 py-2 font-black text-amber-900 hover:bg-amber-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-600"><span aria-hidden="true">🏆</span>Sala de Records</Link>
    </header>

    <div role="tablist" aria-label="Meus Estudos" className="mt-7 flex gap-2 border-b border-slate-200">
      <button type="button" role="tab" aria-selected={tab === "active"} onClick={() => setTab("active")} className={`min-h-11 border-b-2 px-4 font-black ${tab === "active" ? "border-blue-700 text-blue-700" : "border-transparent text-slate-600 hover:text-blue-700"}`}>Edital personalizado</button>
      <button type="button" role="tab" aria-selected={tab === "library"} onClick={() => setTab("library")} className={`min-h-11 border-b-2 px-4 font-black ${tab === "library" ? "border-blue-700 text-blue-700" : "border-transparent text-slate-600 hover:text-blue-700"}`}>Minhas Leis</button>
    </div>

    {loading ? <p role="status" className="mt-6 rounded-2xl border border-blue-100 bg-white p-8 text-slate-600 shadow-sm">Carregando suas leis.</p> : null}
    {!loading && error ? <div role="alert" className="mt-6 rounded-2xl border border-red-200 bg-white p-8 text-red-700 shadow-sm"><p>{error}</p><button type="button" onClick={onRetry} className="mt-4 rounded-xl bg-blue-700 px-5 py-3 font-black text-white">Tentar novamente</button></div> : null}
    {!loading && !error && tab === "active" ? <section role="tabpanel" aria-label="Edital personalizado" className="mt-6"><ActiveStudy law={selected} recorteId={selectedScopeId} requester={studyRequester} /><StudentExamClient embedded requester={examRequester} onStudyLawSelect={selectExamLaw} /></section> : null}
    {!loading && !error && tab === "library" ? library ?? <section role="tabpanel" className="mt-6"><div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5"><label htmlFor="hub-law-search" className="text-sm font-black text-slate-800">Buscar uma lei</label><input id="hub-law-search" type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Título, código ou contexto" className="mt-2 min-h-12 w-full rounded-xl border border-slate-300 px-4 text-slate-900 outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-100" /><p className="mt-3 text-sm font-semibold text-slate-500">{shown.length} {shown.length === 1 ? "contexto disponível" : "contextos disponíveis"}</p></div><div className="mt-4 grid gap-3" aria-label="Leis liberadas">{shown.map((law) => <Link key={keyOf(law)} href={law.studyContextKind === "recorte" && law.studyContextId ? `/estudar/lei/${encodeURIComponent(law.slug)}?recorte_id=${encodeURIComponent(law.studyContextId)}` : `/estudar/lei/${encodeURIComponent(law.slug)}?contexto=completo`} className="grid min-w-0 gap-2 rounded-2xl border border-slate-200 bg-white p-4 text-left shadow-sm transition hover:border-blue-300 hover:bg-blue-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700"><span className="flex items-center gap-3"><Image src="/icons/flashcards-law.png" alt="" aria-hidden="true" width={40} height={40} className="h-10 w-10 shrink-0 object-contain" /><span className="min-w-0"><span className="block break-words text-lg font-black text-[#062a5f]">{studentLawMotherTitle(law.titulo, law.studyContextName)}</span>{law.studyContextName ? <span className="mt-1 inline-flex rounded-full bg-blue-50 px-2 py-1 text-xs font-black text-blue-700">{law.studyContextName}</span> : <span className="mt-1 block text-sm font-semibold text-slate-600">Lei completa</span>}</span></span><span className="text-sm font-bold text-slate-600">{law.campaignProgress ?? 0}% concluído · Estudar lei</span></Link>)}</div>{!shown.length ? <p className="mt-6 rounded-2xl border border-slate-200 bg-white p-8 text-slate-600">Nenhuma lei encontrada.</p> : null}</section> : null}
  </main>;
}

function ActiveStudy({ law, recorteId, requester }: { law: StudentLaw | null; recorteId: string | null; requester?: (path: string, method?: string) => Promise<unknown> }) {
  if (!law) return null;
  return <div className="mb-6 overflow-hidden rounded-3xl border border-blue-200 bg-white shadow-sm"><LawStudyPageClient key={`${keyOf(law)}:${recorteId ?? "completa"}`} slug={law.slug} ankiTutorialSettings={null} embedded compact recorteId={recorteId} requester={requester} /></div>;
}
