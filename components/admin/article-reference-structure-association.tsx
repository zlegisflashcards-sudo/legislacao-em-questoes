import { savePreparedLegislativeReferenceStructureAssociation } from "@/app/admin/artigos/reference-actions";

type Association = {
  law: { id: number; title: string };
  reference: { id: string; ordem: string; identification: string };
  currentStructureId: number | null;
  currentStructureLabel: string | null;
  suggestion: {
    status: "associated" | "unassociated" | "ambiguous";
    structureId: number | null;
    label: string | null;
    candidateStructureIds: number[];
    candidateLabels: string[];
  };
  options: Array<{ id: number; label: string }>;
};

function suggestionText(suggestion: Association["suggestion"]) {
  if (suggestion.status === "associated") return `Sugestão calculada: ${suggestion.label ?? "estrutura identificada"}. Confirme-a somente após revisão editorial.`;
  if (suggestion.status === "ambiguous") return `Associação ambígua: há evidências em ${suggestion.candidateLabels.join(" e ") || "estruturas diferentes"}. Nenhuma estrutura foi escolhida automaticamente.`;
  return "Sem evidência estrutural suficiente nas questões. Este bloco continua sem associação até uma confirmação editorial.";
}

/**
 * Painel administrativo deliberadamente simples: a sugestão é informativa;
 * somente o select salvo pelo administrador torna-se o vínculo de verdade.
 */
export function ArticleReferenceStructureAssociation({ association, slug }: { association: Association; slug: string }) {
  return <section className="article-reference-structure-association" aria-labelledby="reference-structure-title">
    <h2 id="reference-structure-title">Associação estrutural editorial</h2>
    <p>Lei: <strong>{association.law.title}</strong> · Ordem: <code>{association.reference.ordem}</code> · Bloco: <strong>{association.reference.identification}</strong>.</p>
    <p>Vínculo confirmado: <strong>{association.currentStructureLabel ?? "nenhum"}</strong>.</p>
    <p className={association.suggestion.status === "ambiguous" ? "admin-alert" : "article-interaction-note"}>{suggestionText(association.suggestion)}</p>
    <form action={savePreparedLegislativeReferenceStructureAssociation} className="article-reference-structure-form">
      <input type="hidden" name="id" value={association.reference.id} />
      <input type="hidden" name="slug" value={slug} />
      <input type="hidden" name="ordem" value={association.reference.ordem} />
      <label>Estrutura vinculada
        <select name="structure_id" defaultValue={association.currentStructureId?.toString() ?? ""}>
          <option value="">Sem estrutura vinculada</option>
          {association.options.map((structure) => <option key={structure.id} value={structure.id}>{structure.label}</option>)}
        </select>
      </label>
      <button className="admin-button secondary">Salvar associação estrutural</button>
    </form>
    <p className="article-interaction-note">A remoção manual mantém o bloco, a Ordem, o texto legislativo e todos os vínculos das questões.</p>
  </section>;
}
