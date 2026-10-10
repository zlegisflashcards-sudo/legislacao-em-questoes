"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { QuestionRichEditor } from "@/components/admin/question-rich-editor";
import { shouldNavigateToStandardizedOrder, standardizationContextOrder, type StandardizationField } from "@/lib/question-standardization-flow";
import { validateQuestionStructure, type StructuralValidation } from "@/lib/question-structure-consistency";

export type StandardizableQuestion = { id: string; slug: string; ordem: string; assunto: string | null; legislacao: string | null };
type Changes = { assunto: string; ordem: string; legislacao: string };

async function post(body: Record<string, unknown>) {
  const response = await fetch("/api/admin/questoes", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(typeof payload.error === "string" ? payload.error : "Não foi possível padronizar as questões.");
  return payload;
}

export function QuestionStandardizationPanel({ lawSlug, slug, ordem, questions, selectedIds, onClose, onSuccess, hrefForOrder, contextMode = false, legislationOnly = false, linkedCounts = { legisbot: 0, community: 0, highlights: 0 }, granularityPending = false, initialGranularityDecision = "" }: { lawSlug: string; slug: string; ordem: string; questions: StandardizableQuestion[]; selectedIds: string[]; onClose: () => void; onSuccess: () => void; hrefForOrder: (order: string) => string; contextMode?: boolean; legislationOnly?: boolean; linkedCounts?: { legisbot: number; community: number; highlights: number }; granularityPending?: boolean; initialGranularityDecision?: "" | "paragrafo_inteiro" | "recorte_inciso" }) {
  const router = useRouter();
  const initialContextChanges: Changes = contextMode ? { assunto: questions.find((question) => selectedIds.includes(question.id))?.assunto ?? "", ordem, legislacao: questions.find((question) => selectedIds.includes(question.id))?.legislacao ?? "" } : { assunto: "", ordem: "", legislacao: "" };
  const [changes, setChanges] = useState<Changes>(initialContextChanges);
  const [review, setReview] = useState(false); const [busy, setBusy] = useState(false); const [error, setError] = useState(""); const [appliedFields, setAppliedFields] = useState<Array<keyof Changes>>([]); const [structuralValidation, setStructuralValidation] = useState<StructuralValidation | null>(null); const [granularityDecision, setGranularityDecision] = useState<"" | "paragrafo_inteiro" | "recorte_inciso">(initialGranularityDecision);
  const selected = useMemo(() => contextMode ? questions : questions.filter((question) => selectedIds.includes(question.id)), [contextMode, questions, selectedIds]);
  const editableFields = legislationOnly ? (["legislacao"] as const) : (["assunto", "ordem", "legislacao"] as const);
  const fields = editableFields.filter((field) => contextMode ? changes[field] !== initialContextChanges[field] : changes[field].trim() !== "");
  const canReview = Boolean(fields.length || granularityDecision);
  const variations = (field: keyof Changes) => new Set(selected.map((item) => item[field] ?? "")).size;
  async function apply() {
    if (!fields.length && !(contextMode && granularityDecision)) { setError("Escolha uma decisão editorial ou informe um campo para padronizar."); return; }
    setBusy(true); setError(""); setAppliedFields([]);
    if (contextMode) {
      try {
        const preview = await post({ action: "previsualizar_padronizacao_contexto", law_slug: lawSlug, context_slug: slug, context_ordem: ordem, changes, granularity_decision: granularityDecision || undefined });
        setStructuralValidation(preview.structural_validation ?? null);
        const result = await post({ action: "aplicar_padronizacao_contexto", law_slug: lawSlug, context_slug: slug, context_ordem: ordem, changes, granularity_decision: granularityDecision || undefined, expected_question_ids: questions.map((question) => question.id).sort() });
        setAppliedFields(fields);
        if (result.moved) router.replace(hrefForOrder(String(result.next_order)));
        else onSuccess();
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : "Falha ao padronizar o contexto do artigo.");
        router.refresh();
      } finally { setBusy(false); }
      return;
    }
    const applied: StandardizationField[] = [];
    try {
      for (const field of fields) {
        const currentOrder = standardizationContextOrder(ordem, changes.ordem, applied);
        const preview = await post({ action: "previsualizar_edicao_lote", law_slug: lawSlug, scope: "selected", field, value: changes[field], question_ids: selectedIds, context_slug: slug, context_ordem: currentOrder });
        await post({ action: "aplicar_edicao_lote", law_slug: lawSlug, scope: "selected", field, value: changes[field], question_ids: selectedIds, context_slug: slug, context_ordem: currentOrder, expected: preview.expected });
        applied.push(field); setAppliedFields([...applied]);
      }
      if (shouldNavigateToStandardizedOrder(ordem, changes.ordem, applied)) router.replace(hrefForOrder(standardizationContextOrder(ordem, changes.ordem, applied)));
      else onSuccess();
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "Falha ao padronizar as questões.";
      setAppliedFields([...applied]);
      setError(message);
      if (shouldNavigateToStandardizedOrder(ordem, changes.ordem, applied)) router.replace(hrefForOrder(standardizationContextOrder(ordem, changes.ordem, applied)));
      else router.refresh();
    }
    finally { setBusy(false); }
  }
  return <div className="admin-modal-backdrop" role="presentation"><section className="admin-modal question-standardization-modal" role="dialog" aria-modal="true" aria-labelledby="standardize-questions-title">
    <header className="question-standardization-header"><span aria-hidden="true">≡</span><div><p>{contextMode ? "PADRONIZAÇÃO DO CONTEXTO" : legislationOnly ? "CORREÇÃO DE LEGISLAÇÃO" : "MANUTENÇÃO EM LOTE"}</p><h2 id="standardize-questions-title">{contextMode ? "Padronizar artigo" : legislationOnly ? "Criar legislação correta" : "Padronizar questões"}</h2><small>{selected.length} questão(ões) {contextMode ? "do contexto" : "selecionada(s)"} · {slug} · {ordem}</small></div></header>
    <p className="question-standardization-context">{contextMode ? review && granularityDecision && !fields.length ? "A decisão editorial será registrada neste contexto; questões e registros vinculados permanecerão inalterados." : "A alteração será aplicada a todas as questões deste slug + ordem e aos registros diretamente vinculados." : legislationOnly ? "Cole ou escreva a redação legal correta. Apenas os flashcards marcados serão atualizados; pergunta, resposta, justificativa, assunto e ordem não serão alterados." : "Edite apenas os campos desejados. Lei e slug permanecem no contexto atual; esta etapa não move questões para outra lei."}</p>
    {error ? <p className="admin-alert error" role="alert">{error}{appliedFields.length ? <> Campos já aplicados: <strong>{appliedFields.map((field) => field === "assunto" ? "Assunto" : field === "ordem" ? "Ordem" : "Legislação").join(", ")}</strong>. Os dados foram recarregados; confira os valores atuais antes de tentar novamente.</> : " Nenhum campo foi aplicado nesta tentativa."}</p> : null}
    {!review ? <><div className="question-standardization-fields">{!legislationOnly ? <><label><span>Assunto</span><small>Ex.: Art. 10, § 1º, II</small><input value={changes.assunto} onChange={(event) => setChanges((value) => ({ ...value, assunto: event.target.value }))} placeholder="Manter sem alteração" /></label><label><span>Ordem</span><small>Ex.: 0001.0.00.0.00.0</small><input value={changes.ordem} onChange={(event) => setChanges((value) => ({ ...value, ordem: event.target.value }))} placeholder="Manter sem alteração" /></label></> : null}<div className="question-standardization-legislation"><span>Legislação</span><small>Cole do Google Docs: quebras de linha, negrito e cores serão mantidos.</small><QuestionRichEditor label="Texto legal" value={changes.legislacao} onChange={(legislacao) => setChanges((value) => ({ ...value, legislacao }))} /></div></div>{contextMode ? <fieldset className="admin-alert"><legend><strong>Possível erro editorial</strong></legend><p>{granularityPending ? "Observação: neste caso, a possível inconsistência é de granularidade da legislação." : "Registre, quando necessário, uma decisão editorial sobre a granularidade da legislação."}</p><label className="flex gap-2"><input type="radio" name="granularity" value="paragrafo_inteiro" checked={granularityDecision === "paragrafo_inteiro"} onChange={() => setGranularityDecision("paragrafo_inteiro")} />Manter como está</label><label className="mt-2 flex gap-2"><input type="radio" name="granularity" value="recorte_inciso" checked={granularityDecision === "recorte_inciso"} onChange={() => setGranularityDecision("recorte_inciso")} />Alterar o recorte da legislação</label></fieldset> : null}<div className="admin-modal-actions"><button type="button" className="admin-button secondary" onClick={onClose}>Cancelar</button><button type="button" className="admin-button primary" disabled={!canReview} onClick={() => { if (contextMode) setStructuralValidation(validateQuestionStructure({ assunto: changes.assunto, ordem: changes.ordem })); setReview(true); }}>Revisar alterações</button></div></> : <><section className="question-standardization-preview"><h3>Prévia antes → depois</h3><p>{fields.length ? `${selected.length} questão(ões) serão atualizadas.` : "Nenhuma questão será alterada."}{contextMode ? ` Registros vinculados: LegisBot ${linkedCounts.legisbot}, comentários ${linkedCounts.community}, destaques ${linkedCounts.highlights}.` : legislationOnly ? " A legislação será aplicada apenas aos flashcards marcados." : " Valores diferentes são preservados na prévia como variações, mas todos receberão o novo valor."}</p><ul>{fields.map((field) => <li key={field}><strong>{field === "assunto" ? "Assunto" : field === "ordem" ? "Ordem" : "Legislação"}:</strong> {variations(field) > 1 ? "Valores atuais diferentes" : (selected[0]?.[field] || "(vazio)")} → {changes[field]}</li>)}</ul>{granularityDecision ? <p><strong>Decisão editorial:</strong> {granularityDecision === "paragrafo_inteiro" ? "manter como está" : "alterar o recorte da legislação"}.</p> : null}{contextMode && structuralValidation && structuralValidation.status !== "valid" ? <div className="admin-alert"><strong>{structuralValidation.status === "conflict" ? "Conflito estrutural" : "Possível conflito"}</strong><br/>{structuralValidation.message}<br/>Ordem atual: <code>{structuralValidation.currentOrder}</code>{structuralValidation.expectedOrder ? <> · Ordem esperada: <code>{structuralValidation.expectedOrder}</code></> : null}{structuralValidation.differences?.length ? <><br/>Diferença: {structuralValidation.differences.join(", ")}.</> : null}</div> : null}</section><p className="admin-alert">{legislationOnly ? "Confira o texto e confirme a atualização dos flashcards marcados." : "A confirmação registra a decisão editorial. Ela encerra este aviso de granularidade, sem corrigir automaticamente os dados das questões."}</p><div className="admin-modal-actions"><button type="button" className="admin-button secondary" disabled={busy} onClick={() => setReview(false)}>Voltar</button><button type="button" className="admin-button primary" disabled={busy} onClick={() => void apply()}>{busy ? "Padronizando…" : legislationOnly ? "Aplicar legislação" : "Confirmar decisão"}</button></div></>}
  </section></div>;
}
