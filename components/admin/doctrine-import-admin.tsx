"use client";

import { useState } from "react";
import type { DoctrineTransferPayload } from "@/lib/doctrine-import-contract";
import { parseDoctrineTransfer as parseTransfer, requestDoctrineAction as requestAction, type DoctrinePreview } from "@/lib/doctrine-import-client";

export function DoctrineImportAdmin() {
  const [payload, setPayload] = useState<DoctrineTransferPayload | null>(null);
  const [preview, setPreview] = useState<DoctrinePreview | null>(null);
  const [slug, setSlug] = useState("direito-administrativo");
  const [ordem, setOrdem] = useState("0");
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function chooseFile(file: File | undefined) {
    setError(""); setMessage(""); setPreview(null); setConfirm(false);
    if (!file) return;
    try { setPayload(parseTransfer(await file.text())); }
    catch (caught) { setPayload(null); setError(caught instanceof Error ? caught.message : "Arquivo inválido."); }
  }
  async function previewImport() {
    if (!payload) return setError("Selecione o JSON de transferência validado.");
    setBusy(true); setError(""); setMessage("");
    try {
      const result = await requestAction(fetch, "previsualizar", payload, slug, Number(ordem));
      if (!result.preview) throw new Error("A prévia administrativa não retornou dados.");
      setPreview(result.preview);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Não foi possível gerar a prévia."); }
    finally { setBusy(false); }
  }
  async function importPlan() {
    if (!payload || !preview || !confirm) return;
    setBusy(true); setError(""); setMessage("");
    try {
      const result = await requestAction(fetch, "importar", payload, slug, Number(ordem));
      setMessage(`Importação concluída: ${JSON.stringify(result.imported)}`);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Não foi possível importar a doutrina."); }
    finally { setBusy(false); }
  }

  return <section className="commercial-card law-data-form" aria-labelledby="doctrine-import-title">
    <header className="law-data-form-header"><div><h2 id="doctrine-import-title">Importar doutrina</h2><p>Importação estruturada para preservar UUIDs, ordem global de tópicos e hierarquia dos decks. Não cria uma lei genérica.</p></div></header>
    <label>Arquivo JSON de transferência<input type="file" accept="application/json,.json" onChange={(event) => { const file = event.currentTarget.files?.[0]; if (file) void chooseFile(file); }} /></label>
    <label>Slug da disciplina<input value={slug} onChange={(event) => { setSlug(event.target.value); setPreview(null); setConfirm(false); }} pattern="[a-z0-9]+(?:-[a-z0-9]+)*" required /></label>
    <label>Ordem do cadastro<input type="number" min="0" value={ordem} onChange={(event) => { setOrdem(event.target.value); setPreview(null); setConfirm(false); }} required /></label>
    <div className="commercial-form-actions"><button type="button" className="admin-button secondary" disabled={busy || !payload} onClick={() => void previewImport()}>{busy ? "Validando…" : "Validar e gerar prévia"}</button></div>
    {preview ? <section className="admin-alert" aria-live="polite"><strong>{preview.titulo}</strong><p>Slug: <code>{preview.slug}</code> · {preview.questions} questões · {preview.topics} tópicos · {preview.structures.length} estruturas.</p><details><summary>Estruturas</summary><ol>{preview.structures.map((structure) => <li key={`${structure.ordem}-${structure.nome}`}>{structure.nome}</li>)}</ol></details><label><input type="checkbox" checked={confirm} onChange={(event) => setConfirm(event.target.checked)} /> Confirmo a importação atômica desta prévia.</label><div className="commercial-form-actions"><button type="button" className="admin-button primary" disabled={busy || !confirm} onClick={() => void importPlan()}>{busy ? "Importando…" : "Importar doutrina"}</button></div></section> : null}
    {message ? <p className="admin-alert success" role="status">{message}</p> : null}
    {error ? <p className="admin-alert error" role="alert">{error}</p> : null}
  </section>;
}
