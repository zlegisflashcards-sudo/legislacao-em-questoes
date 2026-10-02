"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { articleConflictSessionKey } from "@/components/admin/article-source-conflicts";
import { QuestionStandardizationPanel } from "@/components/admin/question-standardization-panel";

type Question = {
  id: string; pergunta: string; resposta: string; justificativa: string | null; titulo: string | null;
  assunto: string | null; legislacao: string | null; ordem: string; ativo: boolean; updated_at: string; editorUrl: string;
};
type Version = { id: string; sanitizedHtml: string; activeCount: number; differences: Array<{ text: string; changed: boolean }>; questions: Question[] };
type Conflict = {
  slug: string; ordem: string; lawTitle: string; lawCode: string | null; flashcards: number; versions: Version[];
  comment: { id: number; status: string; precisa_revisao: boolean } | null;
  next: { slug: string; ordem: string } | null;
};
type Preview = { versionId: string; count: number; affectedIds: string[]; expected: Array<{ id: string; before: string | null }> };

async function post(body: Record<string, unknown>) {
  const response = await fetch("/api/admin/artigos/conflitos", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(typeof result.error === "string" ? result.error : "Não foi possível concluir a operação.");
  return result;
}

export function ArticleSourceConflictDetail({ conflict }: { conflict: Conflict }) {
  const router = useRouter();
  const [preview, setPreview] = useState<Preview | null>(null);
  const [confirmation, setConfirmation] = useState("");
  const [inactive, setInactive] = useState<Question | null>(null);
  const [inactiveConfirmation, setInactiveConfirmation] = useState("");
  const [busy, setBusy] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [standardizeOpen, setStandardizeOpen] = useState(false);
  const [error, setError] = useState("");
  const nextHref = conflict.next ? `/admin/artigos/conflitos/${encodeURIComponent(conflict.next.slug.toLowerCase())}/${encodeURIComponent(conflict.next.ordem)}` : "/admin/artigos?aba=conflitos";

  async function prepare(versionId: string) {
    setBusy(true); setError("");
    try { setPreview(await post({ action: "previsualizar_padronizacao", slug: conflict.slug, ordem: conflict.ordem, version_id: versionId }) as Preview); setConfirmation(""); }
    catch (caught) { setError(caught instanceof Error ? caught.message : "Não foi possível preparar a confirmação."); }
    finally { setBusy(false); }
  }
  function recordResolution() {
    const current = Number(window.sessionStorage.getItem(articleConflictSessionKey) ?? 0) || 0;
    window.sessionStorage.setItem(articleConflictSessionKey, String(current + 1));
  }
  async function apply() {
    if (!preview) return;
    setBusy(true); setError("");
    try {
      const result = await post({ action: "aplicar_padronizacao", slug: conflict.slug, ordem: conflict.ordem, version_id: preview.versionId, expected: preview.expected, confirmation });
      if (result.resolved) recordResolution();
      router.push(result.resolved ? nextHref : window.location.pathname); router.refresh();
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Não foi possível padronizar os flashcards."); }
    finally { setBusy(false); }
  }
  async function deactivate() {
    if (!inactive) return;
    setBusy(true); setError("");
    try {
      const result = await post({ action: "inativar_flashcard", slug: conflict.slug, ordem: conflict.ordem, question_id: inactive.id, confirmation: inactiveConfirmation });
      if (result.resolved) recordResolution();
      router.push(result.resolved ? nextHref : window.location.pathname); router.refresh();
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Não foi possível inativar o flashcard."); }
    finally { setBusy(false); }
  }

  const allQuestions = conflict.versions.flatMap((version) => version.questions.filter((question) => question.ativo).map((question) => ({ id: question.id, slug: conflict.slug, ordem: conflict.ordem, assunto: question.assunto, legislacao: question.legislacao })));
  const toggleSelected = (id: string) => setSelectedIds((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
  return <section className="grid gap-5">
    {error ? <p className="admin-alert error" role="alert">{error}</p> : null}
    <div className="flex flex-wrap items-center justify-between gap-3"><p className="text-sm text-slate-600">{conflict.flashcards} flashcards ativos em {conflict.versions.length} versões realmente diferentes.</p><div className="flex gap-2">{selectedIds.length ? <button type="button" className="admin-button primary" onClick={() => setStandardizeOpen(true)}>Padronizar questões ({selectedIds.length})</button> : null}<Link className="admin-button secondary" href={nextHref}>Próximo conflito →</Link></div></div>
    <div className="grid gap-5 xl:grid-cols-2">{conflict.versions.map((version, index) => <article className="commercial-card min-w-0" key={version.id}>
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-200 pb-4"><div><span className="law-center-kicker">Versão {index + 1}</span><h2 className="mt-1">{version.activeCount} flashcard(s) ativo(s)</h2></div><button type="button" className="admin-button primary" disabled={busy} onClick={() => void prepare(version.id)}>Usar esta legislação como padrão</button></header>
      <section className="mt-4"><h3 className="font-black">Legislação renderizada</h3><div className="legisbot-legal-html mt-2 rounded-xl border border-slate-200 bg-white p-4" dangerouslySetInnerHTML={{ __html: version.sanitizedHtml }} /></section>
      <details className="mt-4" open><summary className="cursor-pointer font-black">Diferença textual</summary><p className="mt-2 whitespace-pre-wrap rounded-xl bg-slate-50 p-4 text-sm leading-7">{version.differences.map((part, partIndex) => part.changed ? <mark className="rounded bg-amber-200 px-0.5" key={partIndex}>{part.text}</mark> : <span key={partIndex}>{part.text}</span>)}</p></details>
      <details className="mt-4" open><summary className="cursor-pointer font-black">Flashcards desta versão ({version.questions.length})</summary><div className="mt-3 grid gap-3">{version.questions.map((question) => <article className="rounded-xl border border-slate-200 p-4" key={question.id}>
        <div className="flex flex-wrap items-center justify-between gap-2"><label className="flex items-center gap-1 text-xs font-bold"><input type="checkbox" checked={selectedIds.includes(question.id)} onChange={() => toggleSelected(question.id)} />Selecionar</label><code className="text-xs">{question.id}</code><span className={`admin-status ${question.ativo ? "status-concluido" : "status-erro"}`}>{question.ativo ? "Ativo" : "Inativo"}</span></div>
        <dl className="mt-3 grid gap-2 text-sm"><Data label="Pergunta" value={question.pergunta} /><Data label="Resposta" value={question.resposta} /><Data label="Justificativa" value={question.justificativa} /><Data label="Título" value={question.titulo} /><Data label="Assunto" value={question.assunto} /><Data label="Ordem" value={question.ordem} /><Data label="Atualizado" value={new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date(question.updated_at))} /></dl>
        <div className="mt-4 flex flex-wrap gap-2"><Link className="admin-button secondary" href={question.editorUrl}>Editar flashcard</Link><Link className="admin-button secondary" href={question.editorUrl}>Corrigir a ordem</Link>{question.ativo ? <button type="button" className="admin-button danger" onClick={() => { setInactive(question); setInactiveConfirmation(""); }}>Inativar flashcard</button> : null}</div>
      </article>)}</div></details>
    </article>)}</div>
    {preview ? <div className="admin-modal-backdrop" role="presentation">
      <section className="admin-modal conflict-standardize-modal" role="dialog" aria-modal="true" aria-labelledby="standardize-title">
        <header className="conflict-modal-header">
          <span className="conflict-modal-icon" aria-hidden="true">↔</span>
          <div>
            <p className="conflict-modal-eyebrow">Correção em lote</p>
            <h2 id="standardize-title">Padronizar legislação</h2>
            <p>Confirme os dados antes de aplicar a versão escolhida.</p>
          </div>
        </header>

        <div className="conflict-modal-summary" aria-label="Resumo da padronização">
          <div><span>Identificação</span><strong>{conflict.slug} · {conflict.ordem}</strong></div>
          <div><span>Flashcards afetados</span><strong>{preview.count}</strong></div>
          <div><span>Campo alterado</span><strong>Legislação</strong></div>
        </div>

        <details className="conflict-affected-records">
          <summary>Ver IDs afetados <span>({preview.affectedIds.length})</span></summary>
          <ul>{preview.affectedIds.map((id) => <li key={id}><code>{id}</code></li>)}</ul>
        </details>

        <div className="conflict-confirmation-box">
          <label htmlFor="standardize-confirmation">Para confirmar, digite <strong>PADRONIZAR</strong></label>
          <input id="standardize-confirmation" autoFocus autoComplete="off" spellCheck={false} placeholder="PADRONIZAR" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} />
          <p>Somente o campo <strong>legislação</strong> será alterado. Os registros serão relidos dentro da operação transacional e qualquer alteração concorrente cancelará a operação com segurança.</p>
        </div>

        <div className="admin-modal-actions"><button type="button" className="admin-button secondary" disabled={busy} onClick={() => setPreview(null)}>Cancelar</button><button type="button" className="admin-button primary" disabled={busy || confirmation !== "PADRONIZAR" || preview.count === 0} onClick={() => void apply()}>{busy ? "Padronizando…" : "Confirmar padronização"}</button></div>
      </section>
    </div> : null}
    {inactive ? <div className="admin-modal-backdrop" role="presentation"><section className="admin-modal" role="dialog" aria-modal="true" aria-labelledby="inactive-title"><h2 id="inactive-title">Inativar flashcard?</h2><p>O flashcard <code>{inactive.id}</code> deixará de participar do conflito. Ele não será excluído.</p><label>Digite <strong>INATIVAR</strong> para confirmar<input autoFocus value={inactiveConfirmation} onChange={(event) => setInactiveConfirmation(event.target.value)} /></label><div className="admin-modal-actions"><button type="button" className="admin-button secondary" disabled={busy} onClick={() => setInactive(null)}>Cancelar</button><button type="button" className="admin-button danger" disabled={busy || inactiveConfirmation !== "INATIVAR"} onClick={() => void deactivate()}>{busy ? "Inativando…" : "Inativar flashcard"}</button></div></section></div> : null}
    {standardizeOpen ? <QuestionStandardizationPanel lawSlug={conflict.slug.toLowerCase()} slug={conflict.slug} ordem={conflict.ordem} questions={allQuestions} selectedIds={selectedIds} onClose={() => setStandardizeOpen(false)} onSuccess={() => { setStandardizeOpen(false); setSelectedIds([]); router.refresh(); }} hrefForOrder={(nextOrder) => `/admin/artigos?aba=conflitos&lei=${encodeURIComponent(conflict.slug)}&ordem=${encodeURIComponent(nextOrder)}`} /> : null}
  </section>;
}

function Data({ label, value }: { label: string; value: string | null }) {
  return <div><dt className="font-black text-slate-500">{label}</dt><dd className="whitespace-pre-wrap break-words">{value || "—"}</dd></div>;
}
