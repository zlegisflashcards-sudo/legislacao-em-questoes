import Link from "next/link";
import { confirmAndReleaseLegislativeStructureAction } from "@/app/admin/artigos/reference-actions";
import styles from "@/app/legisbot/[slug]/continuous-reading.module.css";

type Reference = { referenceId: string; ordem: string; identification: string; currentStructureId: number | null; pending: boolean };

export function LegislativeStructureConfirmationPreview({ slug, structure, references, includedIds, orphanQuestions, shadowArticles, possibleMissingArticles, migrationAvailable }: {
  slug: string;
  structure: { id: number; label: string; activeQuestionCount: number; preparedReferenceCount: number };
  references: Reference[];
  includedIds: string[];
  orphanQuestions: number;
  shadowArticles: number;
  possibleMissingArticles: number[];
  migrationAvailable: boolean;
}) {
  const associated = references.filter((reference) => reference.currentStructureId === structure.id);
  const candidates = references.filter((reference) => reference.pending && includedIds.includes(reference.referenceId));
  const unlinked = references.filter((reference) => reference.pending && !includedIds.includes(reference.referenceId));
  const confirmedSet = [...associated, ...candidates];
  const articleOrders = confirmedSet.map((reference) => Number(reference.ordem.split(".")[0])).filter((value) => Number.isSafeInteger(value) && value > 0).sort((a, b) => a - b);
  const addToPreviewHref = (referenceId: string) => {
    const query = new URLSearchParams({ lei: slug, estrutura: String(structure.id), incluir: [...includedIds, referenceId].join("\n") });
    return `/admin/artigos/legisbot-preview?${query.toString()}`;
  };
  const removeFromPreviewHref = (referenceId: string) => {
    const query = new URLSearchParams({ lei: slug, estrutura: String(structure.id), incluir: includedIds.filter((id) => id !== referenceId).join("\n") });
    return `/admin/artigos/legisbot-preview?${query.toString()}`;
  };
  return <section className={`${styles.confirmationPreview} admin-card`} aria-labelledby="structure-confirmation-title">
    <header className={styles.confirmationHeader}>
      <div><p className={styles.confirmationEyebrow}>Conferência editorial</p><h2 id="structure-confirmation-title">Confirmar e liberar estrutura</h2><p><strong>{slug}</strong><span aria-hidden="true"> · </span>{structure.label}</p></div>
      <div className={styles.confirmationHeaderActions}>
        <Link className="admin-button secondary" href={`/admin/artigos/legisbot-preview/visao-aluno?lei=${encodeURIComponent(slug)}&estrutura=${encodeURIComponent(String(structure.id))}`}>Abrir visão do aluno</Link>
        <span className={styles.confirmationStatus}>{migrationAvailable ? "Prévia pronta para conferência" : "Aguardando migration"}</span>
      </div>
    </header>
    <div className={styles.confirmationMetrics} aria-label="Resumo da estrutura selecionada">
      <div><strong>{associated.length}</strong><span>já associado(s)</span></div>
      <div><strong>{candidates.length}</strong><span>candidato(s) incluído(s)</span></div>
      <div><strong>{structure.activeQuestionCount}</strong><span>questão(ões) no recorte</span></div>
      <div><strong>{structure.preparedReferenceCount}</strong><span>bloco(s) preparado(s)</span></div>
    </div>
    <p className={styles.confirmationRange}>{articleOrders.length ? <>Recorte de artigos: <code>{String(articleOrders[0]).padStart(4, "0")}</code> até <code>{String(articleOrders.at(-1)).padStart(4, "0")}</code>.</> : "Ainda não há Ordem de artigo confirmada no recorte."}</p>
    {unlinked.length ? <section className={styles.confirmationUnlinked} aria-labelledby="unlinked-blocks-title">
      <header><div><p>Revisão necessária</p><h3 id="unlinked-blocks-title">Artigos sem vínculo editorial</h3><span>{unlinked.length} bloco(s) preparado(s) ainda não pertencem a nenhuma estrutura. Escolha somente os que pertencem a este capítulo.</span></div></header>
      <div className={styles.confirmationTableWrap}><table><thead><tr><th>Ordem</th><th>Dispositivo</th><th /></tr></thead><tbody>
        {unlinked.map((reference) => <tr key={`unlinked-${reference.referenceId}`}><td><code>{reference.ordem}</code></td><td>{reference.identification}</td><td><Link className="admin-button secondary" href={addToPreviewHref(reference.referenceId)}>Incluir neste capítulo</Link></td></tr>)}
      </tbody></table></div>
    </section> : null}
    <section className={styles.confirmationBlocks} aria-labelledby="confirmation-blocks-title"><div><h3 id="confirmation-blocks-title">Blocos que serão considerados</h3><p>Os candidatos só recebem associação editorial após a confirmação única e todas as validações.</p></div>
    <div className={styles.confirmationTableWrap}><table><thead><tr><th>Estado</th><th>Ordem</th><th>Dispositivo</th><th /></tr></thead><tbody>
      {associated.map((reference) => <tr key={`associated-${reference.referenceId}`}><td><span className={styles.confirmationAssociated}>Associado</span></td><td><code>{reference.ordem}</code></td><td>{reference.identification}</td><td /></tr>)}
      {candidates.map((reference) => <tr key={`candidate-${reference.referenceId}`}><td><span className={styles.confirmationCandidate}>Candidato</span></td><td><code>{reference.ordem}</code></td><td>{reference.identification}</td><td><Link className="admin-button secondary" href={removeFromPreviewHref(reference.referenceId)}>Retirar</Link></td></tr>)}
      {!associated.length && !candidates.length ? <tr><td colSpan={4}>Nenhum bloco associado ou selecionado para este capítulo.</td></tr> : null}
    </tbody></table></div></section>
    <div className={styles.confirmationChecks}><p><strong>Questões órfãs:</strong> {orphanQuestions} no recorte.</p><p><strong>Artigos sombra:</strong> {shadowArticles} na lei <span>(informativo; o inventário não é requisito desta liberação)</span>.</p>{possibleMissingArticles.length ? <p className={styles.confirmationWarning}><strong>Continuidade:</strong> possível salto entre os artigos {possibleMissingArticles.join(", ")}.</p> : <p className={styles.confirmationOk}><strong>Continuidade:</strong> nenhum salto comprovado entre artigos neste recorte.</p>}</div>
    <form action={confirmAndReleaseLegislativeStructureAction} className={styles.confirmationSubmit}>
      <input type="hidden" name="slug" value={slug}/><input type="hidden" name="structure_id" value={structure.id}/>
      {candidates.map((reference) => <input key={reference.referenceId} type="hidden" name="reference_id" value={reference.referenceId}/>)}
      <div><strong>Confirmação única</strong><p>Ao confirmar, você declara que os blocos apresentados pertencem a esta estrutura. A associação e a liberação serão atômicas.</p></div>
      {!migrationAvailable ? <p className="admin-alert">A confirmação transacional ficará disponível após a aplicação da migration correspondente.</p> : null}
      <button className="admin-button primary" disabled={!migrationAvailable || (!associated.length && !candidates.length)}>Confirmar e liberar</button>
    </form>
  </section>;
}
