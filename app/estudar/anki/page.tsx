import type { Metadata } from "next";
import { AnkiStudyPageClient } from "@/components/anki-study-page-client";
import { getAnkiTutorialSettings } from "@/lib/anki-tutorial-settings-server";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Baixando e configurando o Anki | Legislação para Concursos",
  description: "Instale, acesse e configure o Anki para estudar seus materiais.",
};

export default async function AnkiStudyPage() {
  const settings = await getAnkiTutorialSettings();
  return <AnkiStudyPageClient settings={settings} />;
}
