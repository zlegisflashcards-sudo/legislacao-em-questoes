import { setLegislativeStructureRelease } from "@/app/admin/artigos/reference-actions";
import type { ContinuousReadingLawStructureIntegrity } from "@/lib/legisbot/continuous-reading-structure-integrity-core";
import type { StructureReleaseViewStatus } from "@/lib/legisbot/continuous-reading-structure-release-core";

type Row = ContinuousReadingLawStructureIntegrity["reports"][number] & { releaseStatus: StructureReleaseViewStatus; integrityFingerprint: string; suggestedAssociationCount: number; isRoot: boolean };

const label: Record<StructureReleaseViewStatus, string> = { pending: "Pendente", ready: "Pronta", released: "Liberada" };
const reason: Record<string, string> = {
  reference_unattributed: "bloco sem associação estrutural",
  reference_unprepared: "bloco ainda não preparado",
  reference_unassociated: "associação editorial pendente",
  reference_ambiguous: "associação estrutural ambígua",
  orphan_question: "questão órfã no recorte",
  orphan_question_unattributed: "questão órfã sem recorte seguro",
  question_structure_mismatch: "questão e bloco em estruturas diferentes",
  descendant_empty: "descendente sem evidência suficiente",
  article_gap_confirmed: "lacuna comprovada na sequência de artigos",
};

export function LegislativeStructureReleaseDashboard({ slug, migrationAvailable, rows, lawAvailable }: { slug: string; migrationAvailable: boolean; rows: Row[]; lawAvailable: boolean }) {
  if (!migrationAvailable) return <section className="admin-card"><h2>Liberação por estrutura</h2><p className="admin-alert">Indisponível até a aplicação da migration de liberação por estrutura. A prévia administrativa e a Lei Interativa pública continuam inalteradas.</p></section>;
  if (!rows.length) return <section className="admin-card"><h2>Liberação por estrutura</h2><p>Esta lei não possui hierarquia cadastrada. A regra global atual continua sendo a única aplicável.</p></section>;
  return <section className="admin-card" aria-labelledby="structure-release-title">
    <h2 id="structure-release-title">Liberação manual por Título</h2>
    <p>O estado Pronta não publica nada automaticamente. Os Títulos aparecem na mesma ordem da estrutura da lei; capítulos e demais filhos seguem a decisão do respectivo Título.</p>
    {!lawAvailable ? <small>A lei precisa estar ativa para disponibilização pública.</small> : <small>A confirmação é manual e auditável. Títulos fechados não aparecem no sumário do aluno.</small>}
    <div className="admin-table-wrap"><table><thead><tr><th>Título</th><th>Questões</th><th>Blocos</th><th>Pendências</th><th>Status</th><th>Ação</th></tr></thead><tbody>
      {rows.map((row) => <tr key={row.structureId}><td><strong>{row.path.join(" › ") || row.name}</strong></td><td>{row.activeQuestionCount}</td><td>{row.preparedReferenceCount}</td><td>{row.reasons.length ? row.reasons.map((item) => reason[item] ?? item).join("; ") : "Nenhuma"}{row.articleContinuity && row.articleContinuity.possibleMissingArticles.length && !row.articleContinuity.confirmedMissingArticles.length ? <><br/><small>Aviso: possível salto entre artigos {row.articleContinuity.possibleMissingArticles.join(", ")}.</small></> : null}</td><td><strong>{label[row.releaseStatus]}</strong></td><td><div className="article-header-actions">{row.releaseStatus === "released" ? <form action={setLegislativeStructureRelease}><input type="hidden" name="slug" value={slug}/><input type="hidden" name="structure_id" value={row.structureId}/><input type="hidden" name="release_action" value="block"/><button className="admin-button secondary">Desligar</button></form> : row.releaseStatus === "ready" ? <form action={setLegislativeStructureRelease}><input type="hidden" name="slug" value={slug}/><input type="hidden" name="structure_id" value={row.structureId}/><input type="hidden" name="release_action" value="release"/><input type="hidden" name="integrity_fingerprint" value={row.integrityFingerprint}/><button className="admin-button primary" disabled={!lawAvailable}>Ligar Título</button></form> : <button className="admin-button secondary" disabled title="Resolva as pendências antes de ligar este Título.">Indisponível</button>}</div></td></tr>)}
    </tbody></table></div>
  </section>;
}
