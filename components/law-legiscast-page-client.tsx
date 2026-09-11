"use client";

import { useCallback, useEffect, useState } from "react";
import { LegiscastAudioPlayer } from "@/components/legiscast-audio-player";
import { LegiscastPdfActions, LegiscastPdfViewer } from "@/components/legiscast-pdf-viewer";
import { LegiscastCommentedArticles } from "@/components/legiscast-commented-articles";
import { StudentAreaTabs } from "@/components/student-area-tabs";
import type { ComentarioPublicoLegisBot } from "@/lib/legisbot/comentarios-publicos";
import type { LawStudyData } from "@/lib/law-study";
import { supabase } from "@/lib/supabase";

// Compatibilidade de incorporação: <LegiscastAudioPlayer slug={slug} embedded />

function LegiscastSkeleton() {
  return <div className="mx-auto w-full max-w-[1600px] px-4 py-6 sm:px-6 sm:py-10" aria-busy="true" aria-label="Carregando LegisCast"><div className="h-28 animate-pulse rounded-3xl border border-blue-100 bg-slate-100" /><section className="mt-5 grid overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm lg:grid-cols-[minmax(0,3fr)_minmax(320px,1fr)]"><div className="hidden h-[calc(74vh+4rem)] animate-pulse border-r border-slate-200 bg-slate-100 lg:block" /><div className="h-[calc(74vh+4rem)] animate-pulse bg-slate-50 p-6"><div className="h-8 w-40 rounded bg-slate-200" /><div className="mt-5 h-44 rounded-xl bg-slate-200" /><div className="mt-5 space-y-3 border-t border-slate-200 pt-4">{[1, 2, 3, 4, 5].map((item) => <div key={item} className="h-10 rounded bg-slate-200" />)}</div></div></section></div>;
}

export function LawLegiscastPageClient({ slug, recorteId, commentedArticles = [] }: { slug: string; recorteId: string | null; commentedArticles?: ComentarioPublicoLegisBot[] }) {
  const [study, setStudy] = useState<LawStudyData | null>(null); const [error, setError] = useState(""); const [pdfReady, setPdfReady] = useState(false); const [audioReady, setAudioReady] = useState(false); const [attempt, setAttempt] = useState(0); const [mobilePdfOpen, setMobilePdfOpen] = useState(false); const [mobileLayout, setMobileLayout] = useState<boolean | null>(null);
  const completePdf = useCallback(() => setPdfReady(true), []); const completeAudio = useCallback(() => setAudioReady(true), []); const fail = useCallback((message: string) => setError(message), []);
  useEffect(() => { let active = true; setStudy(null); setError(""); setPdfReady(false); setAudioReady(false); void (async () => { const { data } = await supabase.auth.getSession(); const token = data.session?.access_token; if (!token) { const target = `/estudar/lei/${slug}/legiscast${recorteId ? `?recorte_id=${encodeURIComponent(recorteId)}` : ""}`; window.location.replace(`/conta?modo=login&retorno=${encodeURIComponent(target)}`); return; } try { const response = await fetch(`/api/aluno/estudar/lei/${encodeURIComponent(slug)}`, { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" }); const body = await response.json().catch(() => ({})); if (!response.ok || !body.study) throw new Error(body.message || "Não foi possível abrir o LegisCast desta lei."); if (active) { const loaded = body.study as LawStudyData; const pdfMaterial = loaded.materials.find((material) => material.type === "pdf"); console.info("legiscast_materials_resolved", { slug, hasRecorteId: Boolean(recorteId), materialCount: loaded.materials.length, materialTypes: loaded.materials.map((material) => material.type), foundPdf: Boolean(pdfMaterial), accessAvailable: pdfMaterial?.accessAvailable ?? false, hasAccessUrl: Boolean(pdfMaterial?.accessUrl) }); setStudy(loaded); setPdfReady(!loaded.materials.some((material) => material.type === "pdf" && material.accessAvailable)); } } catch (caught) { if (active) setError(caught instanceof Error ? caught.message : "Não foi possível abrir o LegisCast desta lei."); } })(); return () => { active = false; }; }, [slug, recorteId, attempt]);
  useEffect(() => { const media = window.matchMedia("(max-width: 1023px)"); const update = () => setMobileLayout(media.matches); update(); media.addEventListener("change", update); return () => media.removeEventListener("change", update); }, []);
  useEffect(() => { if (!mobilePdfOpen) return; const previousOverflow = document.body.style.overflow; document.body.style.overflow = "hidden"; const closeOnEscape = (event: KeyboardEvent) => { if (event.key === "Escape") setMobilePdfOpen(false); }; window.addEventListener("keydown", closeOnEscape); return () => { document.body.style.overflow = previousOverflow; window.removeEventListener("keydown", closeOnEscape); }; }, [mobilePdfOpen]);
  if (error) return <main className="mx-auto w-full max-w-[1600px] px-4 py-10 sm:px-6"><StudentAreaTabs activeTab="leis" minhasLeisHref="/minhas-leis" /><section className="rounded-2xl border border-red-200 bg-white p-6 text-red-700"><p>{error}</p><button type="button" className="mt-4 rounded-xl bg-blue-700 px-4 py-2 font-black text-white" onClick={() => setAttempt((value) => value + 1)}>Tentar novamente</button></section></main>;
  if (!study) return <main><LegiscastSkeleton /></main>;
  const pdfMaterial = study.materials.find((material) => material.type === "pdf");
  const pdf = pdfMaterial?.accessAvailable ? pdfMaterial : undefined;
  const pageReady = mobileLayout !== null && audioReady && (mobileLayout || pdfReady);
  return <main className="relative mx-auto w-full max-w-[1600px] overflow-x-hidden px-4 py-6 sm:px-6 sm:py-10">
    <div className={pageReady ? "" : "invisible"}>
      <StudentAreaTabs activeTab="leis" minhasLeisHref="/minhas-leis" />
      <header className="mb-5 rounded-3xl border border-blue-100 bg-white p-5 shadow-sm sm:p-7"><h1 className="mt-2 text-2xl font-black leading-tight text-[#062a5f] sm:text-4xl">{study.law.title}</h1>{recorteId ? <p className="mt-2 text-sm text-slate-600">Contexto do recorte selecionado.</p> : null}</header>
      <section className="grid min-w-0 overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm lg:grid-cols-[minmax(0,3fr)_minmax(320px,1fr)]">
        <div className="min-w-0 p-4 sm:p-6">
          <div className="lg:hidden">
            <div className="mb-4 text-center"><h2 className="text-3xl font-black text-[#062a5f]">🎧 LegisCast</h2><p className="mt-1 text-sm text-slate-600">Ouça nossos hosts enquanto acompanha a legislação.</p></div>
            <img src="/images/legiscast-hosts.png" alt={`Capa dos hosts do LegisCast — ${study.law.title}`} className="mx-auto aspect-square w-[min(100%,220px)] rounded-2xl object-cover" />
          </div>
          {mobileLayout === false ? (pdf ? <LegiscastPdfViewer key={`pdf-${attempt}`} slug={slug} materialId={pdf.id} recorteId={recorteId} title={study.law.title} onReady={completePdf} onError={() => fail("Não foi possível carregar o PDF desta lei.")} /> : <p className="rounded-xl bg-slate-50 p-4 text-slate-600">O PDF desta lei não está disponível no momento.</p>) : null}
        </div>
        <div className="min-h-0 min-w-0 p-4 pt-0 sm:p-6 lg:h-[calc(74vh+4rem)]"><LegiscastAudioPlayer key={`audio-${attempt}`} slug={slug} embedded onReady={completeAudio} onError={fail} />{pdf ? <section className="mt-6 rounded-2xl border border-slate-200 bg-slate-50 p-3 lg:hidden" aria-labelledby="mobile-pdf-title"><header className="mb-3 flex items-center gap-3"><img src="/icons/pdf.png" alt="" aria-hidden="true" className="h-11 w-11 shrink-0 rounded-lg object-contain" /><div className="min-w-0 text-left"><h3 id="mobile-pdf-title" className="font-black text-[#062a5f]">Material em PDF</h3><p className="text-xs text-slate-600">Acesse a legislação esquematizada desta lei.</p></div></header><LegiscastPdfActions slug={slug} materialId={pdf.id} recorteId={recorteId} title={study.law.title} onExpand={() => setMobilePdfOpen(true)} /></section> : <p className="mt-6 rounded-xl bg-slate-50 p-3 text-sm text-slate-600 lg:hidden">O PDF desta lei não está disponível no momento.</p>}</div>
      </section>
      <div className="mt-10 border-t border-slate-200 pt-2 lg:mt-0 lg:border-t-0 lg:pt-0"><LegiscastCommentedArticles comments={commentedArticles} recorteId={recorteId} /></div>
    </div>
    {!pageReady ? <div className="absolute inset-x-4 top-6 sm:inset-x-6 sm:top-10"><LegiscastSkeleton /></div> : null}
    {mobilePdfOpen && pdf ? <div className="fixed inset-0 z-[120] flex flex-col bg-white p-3 lg:hidden" role="dialog" aria-modal="true" aria-label={`PDF: ${study.law.title}`}><div className="mb-2 flex items-center justify-between gap-3"><strong className="min-w-0 truncate text-[#062a5f]">{study.law.title}</strong><button type="button" onClick={() => setMobilePdfOpen(false)} className="min-h-11 rounded-xl bg-blue-700 px-4 font-black text-white" aria-label="Fechar PDF">Fechar ×</button></div><div className="min-h-0 flex-1 overflow-hidden"><LegiscastPdfViewer slug={slug} materialId={pdf.id} recorteId={recorteId} title={study.law.title} /></div></div> : null}
  </main>;
}
