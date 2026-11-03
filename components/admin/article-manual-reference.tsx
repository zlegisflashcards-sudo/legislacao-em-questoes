"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

type Preview = {
  lawId: number;
  slug: string;
  identification: string;
  ordem: string;
  legislation: string;
  detectionWarning: string | null;
  validationError: string | null;
  existing: { id: string; identification: string; legislation: string | null } | null;
};

const errorFrom = async (response: Response) => {
  const body = await response.json().catch(() => ({}));
  return typeof body.error === "string" ? body.error : "Não foi possível concluir a operação.";
};

export function ArticleManualReference({ law }: { law: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [legislation, setLegislation] = useState("");
  const [identification, setIdentification] = useState("");
  const [ordem, setOrdem] = useState("");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  const requestPreview = async () => {
    setBusy(true); setMessage("");
    try {
      const response = await fetch("/api/admin/artigos/adicionar-bloco", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "preview", law, legislation, identification, ordem }),
      });
      if (!response.ok) throw new Error(await errorFrom(response));
      const result = await response.json() as Preview;
      setPreview(result); setIdentification(result.identification); setOrdem(result.ordem);
    } catch (error) { setPreview(null); setMessage(error instanceof Error ? error.message : "Não foi possível analisar o bloco."); }
    finally { setBusy(false); }
  };

  const save = async (next: boolean) => {
    if (!preview) return;
    setBusy(true); setMessage("");
    try {
      const expected = {
        lawId: preview.lawId, slug: preview.slug, identification: preview.identification,
        ordem: preview.ordem, legislation: preview.legislation,
      };
      const response = await fetch("/api/admin/artigos/adicionar-bloco", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "create", law, legislation, identification, ordem, expected }),
      });
      if (!response.ok) throw new Error(await errorFrom(response));
      const saved = await response.json() as { ordem: string };
      if (next) {
        setLegislation(""); setIdentification(""); setOrdem(""); setPreview(null);
        setMessage(`Bloco ${saved.ordem} salvo. Cole o próximo trecho.`);
      } else {
        setOpen(false); setPreview(null); setMessage(""); router.refresh();
      }
    } catch (error) { setMessage(error instanceof Error ? error.message : "Não foi possível salvar o bloco."); }
    finally { setBusy(false); }
  };

  const invalidatePreview = () => setPreview(null);
  const existingHref = preview?.existing ? `/admin/artigos/${encodeURIComponent(law)}/${encodeURIComponent(preview.ordem)}?aba=artigo&lei=${encodeURIComponent(law)}` : "";

  return <details className="article-reference-reset" open={open} onToggle={(event) => setOpen((event.currentTarget as HTMLDetailsElement).open)}>
    <summary>Adicionar bloco</summary>
    <div className="mt-3 grid gap-3">
      <p>Cole um único dispositivo. A prévia sugere Assunto e Ordem; se houver mais de um dispositivo, escolha os dados manualmente.</p>
      <label>Texto legislativo<textarea value={legislation} rows={9} placeholder="Ex.: Art. 18-A, § 1º. ..." onChange={(event) => { setLegislation(event.target.value); invalidatePreview(); }} /></label>
      {preview ? <>
        {preview.detectionWarning ? <p className="admin-alert">{preview.detectionWarning}</p> : <p className="admin-alert success">Dispositivo identificado automaticamente. Revise antes de salvar.</p>}
        <div className="grid gap-3 sm:grid-cols-2">
          <label>Assunto / identificação<input value={identification} onChange={(event) => { setIdentification(event.target.value); invalidatePreview(); }} /></label>
          <label>Ordem<input value={ordem} placeholder="0018.a.01.0.00.0" onChange={(event) => { setOrdem(event.target.value); invalidatePreview(); }} /></label>
        </div>
        {preview.validationError ? <p className="admin-alert error" role="alert">{preview.validationError}</p> : null}
        {preview.existing ? <section className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm"><strong>Já existe um bloco nesta Ordem</strong><p className="mt-1">{preview.existing.identification}</p><p className="mt-1 text-slate-600">Nada será sobrescrito automaticamente.</p><Link className="admin-button secondary mt-3" href={existingHref}>Abrir bloco atual para comparar</Link></section> : null}
      </> : null}
      {message ? <p className="admin-alert error" role="alert">{message}</p> : null}
      <div className="flex flex-wrap gap-2">
        <button type="button" className="admin-button secondary" disabled={busy || !legislation.trim()} onClick={() => void requestPreview()}>{busy ? "Analisando…" : preview ? "Revalidar prévia" : "Gerar prévia"}</button>
        {preview && !preview.validationError && !preview.existing ? <><button type="button" className="admin-button primary" disabled={busy} onClick={() => void save(false)}>Salvar bloco</button><button type="button" className="admin-button primary" disabled={busy} onClick={() => void save(true)}>Salvar e próximo</button></> : null}
      </div>
    </div>
  </details>;
}
