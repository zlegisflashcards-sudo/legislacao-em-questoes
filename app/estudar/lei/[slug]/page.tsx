import type { Metadata } from "next";
import { LawStudyPageClient } from "@/components/law-study-page-client";
import { getAnkiTutorialSettings } from "@/lib/anki-tutorial-settings-server";
import { LawStudyBottomNav } from "@/components/law-study-bottom-nav";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Estudar lei | Legislação para Concursos",
  description: "Estude seus materiais e acompanhe as atualizações da legislação adquirida.",
};

type LawStudyPageProps = { params: Promise<{ slug: string }>; searchParams: Promise<{ recorte_id?: string }> };

export default async function LawStudyPage({ params, searchParams }: LawStudyPageProps) {
  const [{ slug }, query] = await Promise.all([params, searchParams]);
  const recorteId = typeof query.recorte_id === "string" ? query.recorte_id : null;
  const settings = await getAnkiTutorialSettings();
  return <div className="pb-24 lg:pb-0"><LawStudyPageClient slug={slug} ankiTutorialSettings={settings} /><LawStudyBottomNav slug={slug} recorteId={recorteId} activeMode="questoes" /></div>;
}
