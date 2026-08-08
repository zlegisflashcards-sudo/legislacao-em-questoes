import type { Metadata } from "next";
import { LawStudyPageClient } from "@/components/law-study-page-client";
import { getAnkiTutorialSettings } from "@/lib/anki-tutorial-settings-server";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Estudar lei | Legislação para Concursos",
  description: "Estude seus materiais e acompanhe as atualizações da legislação adquirida.",
};

type LawStudyPageProps = { params: Promise<{ slug: string }> };

export default async function LawStudyPage({ params }: LawStudyPageProps) {
  const { slug } = await params;
  const settings = await getAnkiTutorialSettings();
  return <LawStudyPageClient slug={slug} ankiTutorialSettings={settings} />;
}
