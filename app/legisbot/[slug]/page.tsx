import { ScopedStudyMaterial } from "@/components/scoped-study-material";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { ContinuousReadingAuthorizedClient } from "./continuous-reading-authorized-client";
import type { LegisBotStudyTab } from "@/components/legisbot-study-tabs";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Lei Interativa | LegisFlashcards",
  description: "Estude a legislação por prioridade no mapa ou percorra a lei completa em leitura ativa.",
};

const first = (value: string | string[] | undefined) => Array.isArray(value) ? value[0] ?? "" : value ?? "";
function initialTab(value: string): Exclude<LegisBotStudyTab, "questions"> { return value === "community" || value === "highlights" ? value : "legisbot"; }

export default async function ContinuousLegisBotPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const [{ slug }, query] = await Promise.all([params, searchParams]);
  if (query.recorte_id !== undefined && (typeof query.recorte_id !== "string" || !query.recorte_id.trim())) notFound();
  const recorteId = first(query.recorte_id);
  if (recorteId) return <ScopedStudyMaterial slug={slug} recorteId={recorteId} mode="reading" />;
  return <ContinuousReadingAuthorizedClient slug={slug} initialTab={initialTab(first(query.tab) || first(query.aba))} recorteId={first(query.recorte_id) || null} questionId={first(query.question_id)} ordem={first(query.ordem)} />;
}
