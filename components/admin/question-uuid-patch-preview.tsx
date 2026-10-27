"use client";

import { useEffect, useState } from "react";
import type { buildQuestionPatchPreview } from "@/lib/question-uuid-patch-preview";
import { QUESTION_PATCH_MAX_BYTES } from "@/lib/question-uuid-patch";

type Preview = ReturnType<typeof buildQuestionPatchPreview> & { confirmation: string | null; apply_available: boolean };
export function QuestionUuidPatchPreview({ lawSlug }: { lawSlug: string }) {
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [raw, setRaw] = useState("");
  const [result, setResult] = useState("");
  const [verified, setVerified] = useState(false);
  const [attempted, setAttempted] = useState(false);
  const [recovery, setRecovery] = useState<{ raw: string; confirmation: string } | null>(null);
  const recoveryKey = `question-patch-recovery:${lawSlug}`;
  useEffect(() => {
    try {
      const saved = sessionStorage.getItem(recoveryKey);
      if (saved) {
        const value = JSON.parse(saved) as { raw?: unknown; confirmation?: unknown };
        if (typeof value.raw === "string" && typeof value.confirmation === "string") setRecovery({ raw: value.raw, confirmation: value.confirmation });
      }
    } catch { /* A leitura indisponível não altera dados. */ }
  }, [recoveryKey]);
  async function analyze() {
    if (!file) return;
    setBusy(true); setError(""); setPreview(null); setResult(""); setAttempted(false);
    try {
      if (file.size > QUESTION_PATCH_MAX_BYTES) throw new Error("O arquivo excede 2 MiB.");
      const content = await file.text();
      const response = await fetch("/api/admin/questoes/patch-uuid", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ law_slug: lawSlug, patch: content }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Falha na análise.");
      setPreview(result as Preview);
      setRaw(content);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Falha na análise."); }
    finally { setBusy(false); }
  }
  async function confirm(action: "apply" | "status") {
    const active = action === "status" && recovery ? recovery : { raw, confirmation: preview?.confirmation ?? "" };
    if (!active.confirmation || !active.raw || busy) return;
    if (action === "apply" && (!preview || !window.confirm(`Confirmar a aplicação das correções em ${preview.counts.aptos} questão(ões)?`))) return;
    if (action === "apply") {
      try { sessionStorage.setItem(recoveryKey, JSON.stringify(active)); setRecovery(active); }
      catch { setError("Não foi possível guardar os dados para consultar o resultado. A aplicação não foi iniciada."); return; }
    }
    setBusy(true); setError("");
    if (action === "apply") setAttempted(true);
    try {
      const response = await fetch("/api/admin/questoes/patch-uuid", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, law_slug: lawSlug, patch: active.raw, confirmation: active.confirmation }) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Não foi possível consultar a operação.");
      setResult(body.message || "Operação registrada.");
      setVerified(body.verified === true);
      if (body.verified === true) { sessionStorage.removeItem(recoveryKey); setRecovery(null); }
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Resultado desconhecido; consulte a operação antes de tentar novamente."); }
    finally { setBusy(false); }
  }
  return <>
    <button type="button" className="admin-button secondary" onClick={() => setOpen(true)}>Importar correções por UUID</button>
    {open ? <div className="admin-modal-backdrop"><section className="admin-modal !w-[min(94vw,860px)] !max-w-[860px] !max-h-[calc(100dvh-32px)] !overflow-y-auto !p-0" role="dialog" aria-modal="true" aria-labelledby="uuid-patch-title">
      <header className="border-b border-blue-100 bg-gradient-to-br from-blue-50 to-slate-50 px-6 py-5 sm:px-7">
        <p className="mb-1 text-xs font-black uppercase tracking-widest text-blue-600">Correções de questões</p>
        <h2 id="uuid-patch-title" className="!m-0 text-xl font-bold text-slate-900">Analisar correções por UUID</h2>
        <p className="mt-2 text-sm leading-6 text-slate-600">Confira as alterações do arquivo antes de qualquer aplicação.</p>
      </header>
      <div className="grid gap-5 px-6 py-5 sm:px-7">
        <div className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm leading-6 text-blue-950"><strong>Esta etapa é somente uma prévia.</strong> Nenhuma questão será alterada. Divergências devem ser revisadas.</div>
        <label className="grid gap-2 text-sm font-bold text-slate-800">Arquivo de correções <span className="font-normal text-slate-500">Selecione um arquivo JSON de até 2 MiB.</span><input className="block w-full min-w-0 rounded-lg border border-slate-300 bg-white p-2 text-sm font-normal text-slate-600 file:mr-3 file:rounded-md file:border-0 file:bg-blue-50 file:px-3 file:py-2 file:font-bold file:text-blue-700 hover:file:bg-blue-100" type="file" accept=".json,application/json" disabled={busy} onChange={(event) => { setFile(event.target.files?.[0] ?? null); setPreview(null); setRaw(""); setResult(""); setAttempted(false); setError(""); }} /></label>
        {error ? <p className="admin-alert error" role="alert">{error}</p> : null}
        {result ? <p className={`admin-alert ${verified ? "success" : "error"}`} role="status">{result}</p> : null}
        {recovery ? <p className="admin-alert" role="status">Há uma operação anterior a conferir. Consulte o resultado antes de iniciar outra análise.</p> : null}
        {preview && !preview.apply_available ? <p className="admin-alert" role="status">A aplicação está desativada até a revisão e validação da operação transacional.</p> : null}
        {preview ? <section className="grid gap-4" aria-live="polite"><div><h3 className="text-base font-bold text-slate-900">Resultado da prévia</h3><p className="mt-1 text-sm text-slate-600">{preview.counts.conflitos ? "Resolva os conflitos antes de confirmar." : "Confira todos os valores antes de confirmar."}</p></div><div className="grid grid-cols-2 gap-2 sm:grid-cols-5">{[["Questões", preview.counts.questions], ["Campos a alterar", preview.counts.campos], ["Aptas", preview.counts.aptos], ["Já aplicadas", preview.counts.ja_aplicados], ["Conflitos", preview.counts.conflitos]].map(([label, count]) => <div key={label} className="rounded-lg border border-slate-200 bg-slate-50 p-3"><span className="block text-xs font-semibold text-slate-600">{label}</span><strong className="mt-1 block text-lg text-slate-900">{count}</strong></div>)}</div><div className="grid gap-3">{preview.items.map((item) => <article key={item.uuid} className="min-w-0 rounded-xl border border-slate-200 bg-white p-4"><div className="flex flex-wrap items-center justify-between gap-2"><strong className="break-all font-mono text-xs text-slate-700">{item.uuid}</strong><span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-bold text-slate-700">{item.status === "indisponivel" ? "Não encontrada, inativa ou de outra lei" : item.status === "ja_aplicado" ? "Já aplicada" : item.status === "apto" ? "Apta" : "Conflito"}</span></div>{(["assunto", "ordem"] as const).map((field) => <div key={field} className="mt-3 border-t border-slate-100 pt-3 text-sm"><strong className="capitalize text-slate-800">{field}</strong><div className="mt-1 grid gap-1 break-words text-slate-600"><p><span className="font-semibold">Atual:</span> {item.current?.[field] ?? "—"}</p><p><span className="font-semibold">Esperado:</span> {item.expected[field]}</p><p><span className="font-semibold">Proposto:</span> {item.proposed[field]}</p></div></div>)}</article>)}</div></section> : null}
      </div>
      <footer className="flex flex-wrap justify-end gap-2 border-t border-slate-200 px-6 py-4 sm:px-7"><button type="button" className="admin-button secondary" disabled={busy} onClick={() => { setOpen(false); setFile(null); setPreview(null); setRaw(""); setResult(""); setAttempted(false); setError(""); }}>Fechar</button>{attempted || recovery ? <button type="button" className="admin-button secondary" disabled={busy} onClick={() => void confirm("status")}>Consultar resultado</button> : null}<button type="button" className="admin-button secondary" disabled={!file || busy || attempted || Boolean(recovery)} onClick={() => void analyze()}>{busy ? "Aguarde…" : "Analisar correções"}</button>{preview?.confirmation && preview.apply_available && !attempted && !recovery ? <button type="button" className="admin-button primary" disabled={busy} onClick={() => void confirm("apply")}>Confirmar correções</button> : null}</footer>
    </section></div> : null}
  </>;
}
