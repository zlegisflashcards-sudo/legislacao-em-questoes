import type { Metadata } from "next";
import { scopedInteractiveReadingEnabled } from "@/lib/legisbot/scoped-interactive-reading-server";
import { LawStudyBottomNav } from "@/components/law-study-bottom-nav";
import { PreparationNotice } from "./preparation-notice";
import styles from "./continuous-reading.module.css";
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
  const recorteId = query.recorte_id === undefined ? null : typeof query.recorte_id === "string" && query.recorte_id ? query.recorte_id : "recorte-invalido";
  if (recorteId !== null && !scopedInteractiveReadingEnabled()) {
    return <div className="pb-24 lg:pb-0"><main className={styles.page}><PreparationNotice lawName="Estudo por recorte" title="Lei Interativa do recorte em preparação" description="A leitura será liberada conforme as estruturas do recorte forem conferidas." /></main><LawStudyBottomNav slug={slug} recorteId={recorteId} activeMode="lei_interativa" /></div>;
  }
  return <ContinuousReadingAuthorizedClient slug={slug} initialTab={initialTab(first(query.tab) || first(query.aba))} recorteId={recorteId} structureId={first(query.structure_id)} questionId={first(query.question_id)} ordem={first(query.ordem)} />;
}
