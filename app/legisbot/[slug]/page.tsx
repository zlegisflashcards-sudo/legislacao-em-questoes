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
      const pending = model.integrity.resolutions.filter((resolution) => !resolution.referenceId).slice(0, 20);
      return <main className={styles.page}><section className={`${styles.shell} ${styles.empty}`}><p className={styles.eyebrow}>LegisBot</p><h1>{model.law.nome_curto || model.law.titulo}</h1><h2>Leitura contínua em preparação</h2><p>Esta legislação ainda possui {model.integrity.pendingQuestions} questão(ões) sem destino legislativo confiável. Os links de artigos já existentes continuam disponíveis normalmente.</p>{pending.length ? <ul className={styles.pending}>{pending.map((item) => <li key={item.questionId}>{item.reason ?? "Vínculo pendente."}</li>)}</ul> : null}</section></main>;
    }
    const initialBlocks = await getContinuousReadingBlocks(model, 0, 30);
    return <ContinuousReadingClient slug={model.law.slug.toUpperCase()} title={model.law.nome_curto || model.law.titulo} references={model.references} initialBlocks={initialBlocks} integrity={model.integrity} initialTab={initialTab(first(query.tab) || first(query.aba))} />;
  } catch (error) {
    console.error("[LegisBot] Falha segura ao montar leitura contínua.", { slug, tipo: error instanceof Error ? error.name : "unknown" });
    return <main className={styles.page}><section className={`${styles.shell} ${styles.empty}`}><h1>Leitura temporariamente indisponível</h1><p>A base legislativa não pôde ser verificada. Nenhuma legislação foi liberada automaticamente.</p></section></main>;
  }
}
