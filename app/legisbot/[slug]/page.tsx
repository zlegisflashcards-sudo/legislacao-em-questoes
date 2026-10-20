import type { Metadata } from "next";
import ContinuousReadingClient from "./continuous-reading-client";
import styles from "./continuous-reading.module.css";
import { getContinuousReadingBlocks, getContinuousReadingModel } from "@/lib/legisbot/continuous-reading-server";
import type { LegisBotStudyTab } from "@/components/legisbot-study-tabs";
import { LawStudyBottomNav } from "@/components/law-study-bottom-nav";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Lei Interativa | LegisFlashcards",
  description: "Estude a legislação por prioridade no mapa ou percorra a lei completa em leitura ativa.",
};

const first = (value: string | string[] | undefined) => Array.isArray(value) ? value[0] ?? "" : value ?? "";
function initialTab(value: string): Exclude<LegisBotStudyTab, "questions"> { return value === "community" || value === "highlights" ? value : "legisbot"; }

export default async function ContinuousLegisBotPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const [{ slug }, query] = await Promise.all([params, searchParams]);
  try {
    const model = await getContinuousReadingModel(slug);
    if (!model) return <main className={styles.page}><section className={`${styles.shell} ${styles.empty}`}><h1>Legislação não encontrada</h1><p>Confira o endereço ou volte à área de estudos.</p></section></main>;
    const studyNav = <LawStudyBottomNav slug={model.law.slug} recorteId={first(query.recorte_id) || null} activeMode="lei_interativa" />;
    if (!model.integrity.readingAvailable) {
      return <div className="pb-24 lg:pb-0"><main className={styles.page}><section className={`${styles.shell} ${styles.empty} ${styles.comingSoon}`}><div className={styles.noveltyIcon} aria-hidden="true">✨</div><p className={styles.eyebrow}>Novidade no LegisBot</p><h1>{model.law.nome_curto || model.law.titulo}</h1><h2>Uma nova forma de estudar a lei está chegando</h2><p>Em breve, você poderá percorrer esta legislação em leitura contínua e tocar em qualquer dispositivo para acessar o LegisBot, a Comunidade, seus Destaques e as Questões — tudo no mesmo lugar.</p><div className={styles.preparationBadge}><span aria-hidden="true">●</span> Estamos preparando os últimos detalhes</div></section></main>{studyNav}</div>;
    }
    const initialBlocks = await getContinuousReadingBlocks(model, 0, 30);
    return <div className="pb-24 lg:pb-0"><ContinuousReadingClient slug={model.law.slug.toUpperCase()} title={model.law.nome_curto || model.law.titulo} references={model.references} initialBlocks={initialBlocks} initialTab={initialTab(first(query.tab) || first(query.aba))} />{studyNav}</div>;
  } catch (error) {
    console.error("[LegisBot] Falha segura ao montar leitura contínua.", { slug, tipo: error instanceof Error ? error.name : "unknown" });
    return <main className={styles.page}><section className={`${styles.shell} ${styles.empty}`}><h1>Leitura temporariamente indisponível</h1><p>A base legislativa não pôde ser verificada. Nenhuma legislação foi liberada automaticamente.</p></section></main>;
  }
}
