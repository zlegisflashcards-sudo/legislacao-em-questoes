"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

export type StandardizableQuestion = { id: string; slug: string; ordem: string; assunto: string | null; legislacao: string | null };
type Changes = { assunto: string; ordem: string; legislacao: string };

async function post(body: Record<string, unknown>) {
  const response = await fetch("/api/admin/questoes", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(typeof payload.error === "string" ? payload.error : "Não foi possível padronizar as questões.");
  return payload;
}

export function QuestionStandardizationPanel({ lawSlug, slug, ordem, questions, selectedIds, onClose, onSuccess }: { lawSlug: string; slug: string; ordem: string; questions: StandardizableQuestion[]; selectedIds: string[]; onClose: () => void; onSuccess: () => void }) {
  const router = useRouter();
  const [changes, setChanges] = useState<Changes>({ assunto: "", ordem: "", legislacao: "" });
  const [review, setReview] = useState(false); const [busy, setBusy] = useState(false); const [error, setError] = useState(""); const [appliedFields, setAppliedFields] = useState<Array<keyof Changes>>([]);
  const selected = useMemo(() => questions.filter((question) => selectedIds.includes(question.id)), [questions, selectedIds]);
  const fields = (["assunto", "ordem", "legislacao"] as const).filter((field) => changes[field].trim() !== "");
  const variations = (field: keyof Changes) => new Set(selected.map((item) => item[field] ?? "")).size;
  async function apply() {
    if (!fields.length) { setError("Informe ao menos um campo para padronizar."); return; }
    setBusy(true); setError(""); setAppliedFields([]);
    const applied: Array<keyof Changes> = [];
    try {
      for (const field of fields) {
        const preview = await post({ action: "previsualizar_edicao_lote", law_slug: lawSlug, scope: "selected", field, value: changes[field], question_ids: selectedIds, context_slug: slug, context_ordem: ordem });
        await post({ action: "aplicar_edicao_lote", law_slug: lawSlug, scope: "selected", field, value: changes[field], question_ids: selectedIds, context_slug: slug, context_ordem: ordem, expected: preview.expected });
        applied.push(field); setAppliedFields([...applied]);
      }
      onSuccess();
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "Falha ao padronizar as questões.";
      setAppliedFields([...applied]);
      setError(message);
      router.refresh();
    }
    finally { setBusy(false); }
  }
  return <div className="admin-modal-backdrop" role="presentation"><section className="admin-modal" role="dialog" aria-modal="true" aria-labelledby="standardize-questions-title">
    <h2 id="standardize-questions-title">Padronizar questões</h2><p>{selected.length} questão(ões) selecionada(s) neste artigo. Lei e slug permanecem no contexto atual; esta etapa não move questões para outra lei.</p>
    {error ? <p className="admin-alert error" role="alert">{error}{appliedFields.length ? <> Campos já aplicados: <strong>{appliedFields.map((field) => field === "assunto" ? "Assunto" : field === "ordem" ? "Ordem" : "Legislação").join(", ")}</strong>. Os dados foram recarregados; confira os valores atuais antes de tentar novamente.</> : " Nenhum campo foi aplicado nesta tentativa."}</p> : null}
    {!review ? <><label>Assunto<input value={changes.assunto} onChange={(event) => setChanges((value) => ({ ...value, assunto: event.target.value }))} placeholder="Manter sem alteração" /></label><label>Ordem<input value={changes.ordem} onChange={(event) => setChanges((value) => ({ ...value, ordem: event.target.value }))} placeholder="Manter sem alteração" /></label><label>Legislação<textarea value={changes.legislacao} onChange={(event) => setChanges((value) => ({ ...value, legislacao: event.target.value }))} placeholder="Manter sem alteração" rows={5} /></label><div className="admin-modal-actions"><button type="button" className="admin-button secondary" onClick={onClose}>Cancelar</button><button type="button" className="admin-button primary" disabled={!fields.length} onClick={() => setReview(true)}>Revisar alterações</button></div></> : <><h3>Prévia antes → depois</h3><p>{selected.length} questões serão analisadas antes de cada alteração. Valores diferentes são preservados na prévia como variações, mas todos receberão o novo valor.</p><ul>{fields.map((field) => <li key={field}><strong>{field === "assunto" ? "Assunto" : field === "ordem" ? "Ordem" : "Legislação"}:</strong> {variations(field) > 1 ? "Valores atuais diferentes" : (selected[0]?.[field] || "(vazio)")} → {changes[field]}</li>)}</ul><p className="admin-alert">A confirmação valida novamente os registros e aplica somente Assunto, Ordem e/ou Legislação. Se uma etapa falhar, a mensagem informa o campo; as etapas já concluídas não são revertidas nesta versão.</p><div className="admin-modal-actions"><button type="button" className="admin-button secondary" disabled={busy} onClick={() => setReview(false)}>Voltar</button><button type="button" className="admin-button primary" disabled={busy} onClick={() => void apply()}>{busy ? "Padronizando…" : "Confirmar padronização"}</button></div></>}
  </section></div>;
}
