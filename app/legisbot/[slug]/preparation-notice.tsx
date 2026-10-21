import Link from "next/link";
import styles from "./continuous-reading.module.css";

type PreparationNoticeProps = { lawName: string; embedded?: boolean; onClose?: () => void };

/** Editorial preparation only; technical failures remain in their own error flow. */
export function PreparationNotice({ lawName, embedded = false, onClose }: PreparationNoticeProps) {
  return <section className={`${styles.shell} ${styles.empty} ${styles.comingSoon}`} aria-labelledby="interactive-law-preparation-title">
    {embedded && onClose ? <button type="button" className="legisbot-overlay-close legisbot-overlay-back" aria-label="Fechar aprofundamento e voltar à tela principal" onClick={onClose}>×</button> : null}
    <div className={styles.noveltyIcon} aria-hidden="true">✦</div>
    <p className={styles.eyebrow}>Novidade no LegisBot</p>
    <h1>{lawName}</h1>
    <h2 id="interactive-law-preparation-title">Estamos aperfeiçoando esta ferramenta</h2>
    <p>Estamos aperfeiçoando esta ferramenta para melhorar sua experiência de estudo. Em breve, teremos novidades por aqui!</p>
    {!embedded ? <Link className={styles.preparationLink} href="/minhas-leis">Ir para Minhas Leis</Link> : null}
  </section>;
}
