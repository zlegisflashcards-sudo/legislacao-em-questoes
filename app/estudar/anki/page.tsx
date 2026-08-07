import type { Metadata } from "next";
import { AnkiStudyPageClient } from "@/components/anki-study-page-client";

export const metadata: Metadata = {
  title: "Baixando e configurando o Anki | Legislação para Concursos",
  description: "Instale, acesse e configure o Anki para estudar seus materiais.",
};

export default function AnkiStudyPage() {
  return <AnkiStudyPageClient />;
}
