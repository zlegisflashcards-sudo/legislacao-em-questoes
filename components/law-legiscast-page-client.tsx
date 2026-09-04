"use client";

import { useEffect, useState } from "react";
import { LegiscastAudioPlayer } from "@/components/legiscast-audio-player";
import { LegiscastPdfViewer } from "@/components/legiscast-pdf-viewer";
import { StudentAreaTabs } from "@/components/student-area-tabs";
import type { LawStudyData } from "@/lib/law-study";
import { supabase } from "@/lib/supabase";

export function LawLegiscastPageClient({ slug, recorteId }: { slug: string; recorteId: string | null }) {
  const [study, setStudy] = useState<LawStudyData | null>(null);
  const [error, setError] = useState("");

  useEffect(() => { void (async () => {
    const { data } = await supabase.auth.getSession(); const token = data.session?.access_token;
    if (!token) { const target = `/estudar/lei/${slug}/legiscast${recorteId ? `?recorte_id=${encodeURIComponent(recorteId)}` : ""}`; window.location.replace(`/conta?modo=login&retorno=${encodeURIComponent(target)}`); return; }
    try {
      const response = await fetch(`/api/aluno/estudar/lei/${encodeURIComponent(slug)}`, { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" });
      const body = await response.json().catch(() => ({})); if (!response.ok || !body.study) throw new Error(body.message || "Não foi possível abrir o LegisCast desta lei."); setStudy(body.study as LawStudyData);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Não foi possível abrir o LegisCast desta lei."); }
  })(); }, [slug, recorteId]);
  if (error) return <main className="mx-auto w-full max-w-6xl px-4 py-10 sm:px-6 sm:py-14"><StudentAreaTabs activeTab="leis" minhasLeisHref="/minhas-leis" /><p className="rounded-2xl border border-red-200 bg-white p-6 text-red-700">{error}</p></main>;
  if (!study) return <main className="mx-auto w-full max-w-6xl px-4 py-10 sm:px-6 sm:py-14"><StudentAreaTabs activeTab="leis" minhasLeisHref="/minhas-leis" /><p className="rounded-2xl border border-slate-200 bg-white p-6 text-slate-600">Carregando LegisCast…</p></main>;
  const pdf = study.materials.find((material) => material.type === "pdf" && material.accessAvailable && material.accessUrl);
  return <main className="mx-auto w-full max-w-6xl overflow-x-hidden px-4 py-10 sm:px-6 sm:py-14"><StudentAreaTabs activeTab="leis" minhasLeisHref="/minhas-leis" /><div className="grid min-w-0 gap-6"><header className="rounded-3xl border border-blue-100 bg-white p-5 shadow-sm sm:p-7"><p className="text-sm font-black uppercase tracking-wide text-blue-700">LegisCast</p><h1 className="mt-2 text-3xl font-black text-[#062a5f] sm:text-4xl">{study.law.title}</h1>{recorteId ? <p className="mt-2 text-sm text-slate-600">Contexto do recorte selecionado.</p> : null}</header><section className="min-w-0 rounded-3xl border border-slate-200 bg-white p-4 shadow-sm sm:p-7" aria-labelledby="legiscast-pdf-title"><h2 id="legiscast-pdf-title" className="text-2xl font-black text-[#062a5f]">PDF da lei</h2>{pdf ? <LegiscastPdfViewer slug={slug} materialId={pdf.id} recorteId={recorteId} title={study.law.title} /> : <p className="mt-4 text-slate-600">O PDF desta lei não está disponível no momento.</p>}<LegiscastAudioPlayer slug={slug} embedded /></section></div></main>;
}
