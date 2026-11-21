"use client";

import Image from "next/image";
import { useCallback, useState } from "react";
import { LegiscastAudioPlayer } from "@/components/legiscast-audio-player";
import { StudentAreaTabs } from "@/components/student-area-tabs";

function LegiscastSkeleton() {
  return <section className="mx-auto w-full max-w-2xl animate-pulse space-y-4 px-4 py-6 sm:px-6" aria-busy="true" aria-label="Carregando LegisCast">
    <div className="h-20 rounded-3xl border border-blue-100 bg-slate-100" />
    <div className="h-72 rounded-3xl border border-slate-200 bg-slate-100" />
  </section>;
}

export function LawLegiscastPageClient({ slug }: { slug: string }) {
  const [lawTitle, setLawTitle] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const completeAudio = useCallback((title: string | null) => setLawTitle(title || "LegisCast"), []);
  const redirectToLogin = useCallback(() => {
    const target = `/estudar/lei/${encodeURIComponent(slug)}/legiscast`;
    window.location.replace(`/conta?modo=login&retorno=${encodeURIComponent(target)}`);
  }, [slug]);

  if (error) return <main className="mx-auto w-full max-w-2xl px-4 py-6 sm:px-6">
    <StudentAreaTabs activeTab="leis" minhasLeisHref="/minhas-leis" />
    <section className="rounded-2xl border border-red-200 bg-white p-6 text-red-700">
      <p>{error}</p>
      <button type="button" className="mt-4 rounded-xl bg-blue-700 px-4 py-2 font-black text-white" onClick={() => { setLawTitle(null); setError(""); setAttempt((value) => value + 1); }}>Tentar novamente</button>
    </section>
  </main>;

  return <main>
    {lawTitle === null ? <LegiscastSkeleton /> : null}
    <div hidden={lawTitle === null} className="mx-auto w-full max-w-2xl px-4 py-6 sm:px-6">
      <StudentAreaTabs activeTab="leis" minhasLeisHref="/minhas-leis" />
      <header className="mb-5 rounded-3xl border border-blue-100 bg-white p-5 shadow-sm sm:p-7">
        <h1 className="text-2xl font-black tracking-tight text-[#062a5f] sm:text-3xl">{lawTitle}</h1>
      </header>
      <section className="min-w-0 rounded-3xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
        <div className="mb-4 text-center">
          <h2 className="text-3xl font-black text-[#062a5f]">🎧 LegisCast</h2>
          <p className="mt-1 text-sm text-slate-600">Estude em qualquer lugar com nossa legislação explicada em áudio!</p>
        </div>
        <Image src="/images/legiscast-hosts.png" alt="Capa dos hosts do LegisCast" width={220} height={220} className="mx-auto mb-4 aspect-square w-[min(100%,220px)] rounded-2xl object-cover" />
        <LegiscastAudioPlayer key={`audio-${attempt}`} slug={slug} embedded onReady={completeAudio} onError={setError} onSessionRequired={redirectToLogin} />
      </section>
    </div>
  </main>;
}
