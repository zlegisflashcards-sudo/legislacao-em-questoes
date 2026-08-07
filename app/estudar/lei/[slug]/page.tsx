import type { Metadata } from "next";
import { LawStudyPageClient } from "@/components/law-study-page-client";

export const metadata: Metadata = {
  title: "Estudar lei | Legislação para Concursos",
  description: "Estude seus materiais e acompanhe as atualizações da legislação adquirida.",
};

type LawStudyPageProps = { params: Promise<{ slug: string }> };

export default async function LawStudyPage({ params }: LawStudyPageProps) {
  const { slug } = await params;
  return <LawStudyPageClient slug={slug} />;
}
