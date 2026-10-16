import Link from "next/link";
import { getContinuousReadingModel } from "@/lib/legisbot/continuous-reading-server";
import styles from "./article-reading-integrity.module.css";

export async function ArticleReadingIntegrity({ slug }: { slug: string }) {
  try {
    const model = await getContinuousReadingModel(slug);
    if (!model) return null;
    const integrity = model.integrity;
    const issues = integrity.resolutions.filter((resolution) => !resolution.referenceId).slice(0, 12);
    return <section className={styles.panel} aria-labelledby="reading-integrity-title">
      <header className={styles.header}><div><h2 id="reading-integrity-title">Integridade da leitura contínua</h2><p>A verificação considera todas as questões ativas e prioriza vínculos editoriais manuais.</p></div><span className={`${styles.status} ${integrity.readingAvailable ? styles.available : styles.pending}`}>{integrity.readingAvailable ? "Legislação em construção" : "Vínculos pendentes"}</span></header>
      <div className={styles.metrics}><div className={styles.metric}><strong>{integrity.totalQuestions}</strong><span>questões ativas</span></div><div className={styles.metric}><strong>{integrity.linkedQuestions}</strong><span>vínculos válidos</span></div><div className={styles.metric}><strong>{integrity.pendingQuestions}</strong><span>pendências</span></div><div className={styles.metric}><strong>{integrity.coveragePercent}%</strong><span>cobertura das questões</span></div></div>
      <p><strong>{integrity.availableBlocks}</strong> bloco(s) legislativo(s) disponível(is). Completude legislativa: <strong>não verificada</strong>.</p>
      {issues.length ? <ul className={styles.issues}>{issues.map((issue) => <li key={issue.questionId}><code>{issue.questionId}</code>: {issue.reason ?? "Destino não resolvido."}</li>)}</ul> : null}
      {integrity.readingAvailable ? <div className={styles.actions}><Link className={styles.link} href={`/legisbot/${encodeURIComponent(model.law.slug)}`} target="_blank">Abrir leitura contínua</Link></div> : null}
    </section>;
  } catch (error) {
    console.error("[Admin] Verificação de integridade da leitura contínua falhou de forma segura.", { slug, tipo: error instanceof Error ? error.name : "unknown" });
    return <section className={styles.panel}><header className={styles.header}><div><h2>Integridade da leitura contínua</h2><p>A verificação completa não pôde ser concluída. A legislação não foi liberada automaticamente.</p></div><span className={`${styles.status} ${styles.unavailable}`}>Verificação indisponível</span></header></section>;
  }
}
