import ContinuousReadingClient from "./continuous-reading-client";
import styles from "./continuous-reading.module.css";
import { getContinuousReadingBlocks, getContinuousReadingModel } from "@/lib/legisbot/continuous-reading-server";
import type { LegisBotStudyTab } from "@/components/legisbot-study-tabs";

export const dynamic = "force-dynamic";

const first = (value: string | string[] | undefined) => Array.isArray(value) ? value[0] ?? "" : value ?? "";
function initialTab(value: string): Exclude<LegisBotStudyTab, "questions"> { return value === "community" || value === "highlights" ? value : "legisbot"; }

export default async function ContinuousLegisBotPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const [{ slug }, query] = await Promise.all([params, searchParams]);
  try {
    const model = await getContinuousReadingModel(slug);
    if (!model) return <main className={styles.page}><section className={`${styles.shell} ${styles.empty}`}><h1>Legislação não encontrada</h1><p>Confira o endereço ou volte à área de estudos.</p></section></main>;
    if (!model.integrity.readingAvailable) {
      return <main className={styles.page}><section className={`${styles.shell} ${styles.empty} ${styles.comingSoon}`}><div className={styles.noveltyIcon} aria-hidden="true">✨</div><p className={styles.eyebrow}>Novidade no LegisBot</p><h1>{model.law.nome_curto || model.law.titulo}</h1><h2>Uma nova forma de estudar a lei está chegando</h2><p>Em breve, você poderá percorrer esta legislação em leitura contínua e tocar em qualquer dispositivo para acessar o LegisBot, a Comunidade, seus Destaques e as Questões — tudo no mesmo lugar.</p><div className={styles.preparationBadge}><span aria-hidden="true">●</span> Estamos preparando os últimos detalhes</div></section></main>;
    }
    const initialBlocks = await getContinuousReadingBlocks(model, 0, 30);
    return <ContinuousReadingClient slug={model.law.slug.toUpperCase()} title={model.law.nome_curto || model.law.titulo} references={model.references} initialBlocks={initialBlocks} initialTab={initialTab(first(query.tab) || first(query.aba))} />;
  } catch (error) {
    console.error("[LegisBot] Falha segura ao montar leitura contínua.", { slug, tipo: error instanceof Error ? error.name : "unknown" });
    return <main className={styles.page}><section className={`${styles.shell} ${styles.empty}`}><h1>Leitura temporariamente indisponível</h1><p>A base legislativa não pôde ser verificada. Nenhuma legislação foi liberada automaticamente.</p></section></main>;
  }
}
