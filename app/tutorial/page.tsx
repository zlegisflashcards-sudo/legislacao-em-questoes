import type { Metadata } from "next";
import { AnkiStudyPageClient } from "@/components/anki-study-page-client";
import { LawStudyPageClient } from "@/components/law-study-page-client";
import { getAnkiTutorialSettings } from "@/lib/anki-tutorial-settings-server";
import { loadPublicSampleLawStudy, PUBLIC_SAMPLE_LAW_SLUG } from "@/lib/law-study-server";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Tutorial gratuito do Anki | LegisFlashcards",
  description: "Instale o Anki e pratique com uma amostra gratuita da Constituição Federal.",
};

export default async function TutorialPage() {
  const settings = await getAnkiTutorialSettings();
  let study = null;
  try { study = await loadPublicSampleLawStudy(); } catch (error) { console.error("Amostra pública indisponível", error); }
  return <main>
    <AnkiStudyPageClient settings={settings} publicMode />
    <div id="amostra-gratis" className="scroll-mt-6">{study ? <LawStudyPageClient slug={PUBLIC_SAMPLE_LAW_SLUG} ankiTutorialSettings={settings} publicStudy={study} /> : <div className="mx-auto w-full max-w-6xl px-4 py-10 sm:px-6"><section className="rounded-3xl border border-amber-200 bg-amber-50 p-6 text-slate-800 shadow-sm"><h2 className="text-2xl font-black text-[#062a5f]">Amostra gratuita em preparação</h2><p className="mt-2">O tutorial do Anki já está disponível. Estamos preparando a amostra prática para você.</p></section></div>}</div>
  </main>;
}
