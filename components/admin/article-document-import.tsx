"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Reference = { ordem: string; identification: string; legislation: string; operation: "criar" | "preencher" | "preservar" };
type Preview = { references: Reference[]; rejected: string[]; sample: Reference[] };

export function ArticleDocumentImport({ law }: { law: string }) {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function request(action: "preview" | "apply") {
    if (!file) { setError("Selecione um documento DOCX, TXT ou Markdown."); return; }
    setBusy(true); setError("");
    try {
      const form = new FormData(); form.set("action", action); form.set("law", law); form.set("file", file);
      if (action === "apply" && preview) form.set("expected", JSON.stringify(preview.references.map(({ ordem, identification, legislation, operation }) => ({ ordem, identification, legislation, operation }))));
      const response = await fetch("/api/admin/artigos/importar-documento", { method: "POST", body: form });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(typeof result.error === "string" ? result.error : "Não foi possível processar o documento.");
      if (action === "preview") setPreview(result as Preview);
      else { setPreview(null); setFile(null); router.refresh(); }
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Não foi possível processar o documento."); } finally { setBusy(false); }
  }
  return <details className="article-reference-reset"><summary>Importar artigo de um documento</summary><div className="mt-3 grid gap-3"><p>Envie um artigo por vez em DOCX, TXT ou Markdown. Use títulos como <code>Art. 1º</code>, <code>§ 1º</code>, <code>I</code> e <code>a)</code>.</p><input type="file" accept=".docx,.txt,.md,text/plain,application/vnd.openxmlformats-officedocument.wordprocessingml.document" onChange={(event) => { setFile(event.target.files?.[0] ?? null); setPreview(null); setError(""); }} />{error ? <p className="admin-alert error">{error}</p> : null}{!preview ? <button type="button" className="admin-button secondary" disabled={busy || !file} onClick={() => void request("preview")}>{busy ? "Lendo documento…" : "Gerar prévia da importação"}</button> : <><section className="admin-alert"><strong>Prévia: {preview.references.length} referência(s)</strong><p>{preview.references.filter((item) => item.operation === "criar").length} nova(s), {preview.references.filter((item) => item.operation === "preencher").length} base(s) vazia(s) preenchida(s) e {preview.references.filter((item) => item.operation === "preservar").length} base(s) preparada(s) preservada(s).</p><ul>{preview.sample.map((item) => <li key={item.ordem}><code>{item.ordem}</code> · {item.identification} — {item.operation}</li>)}</ul>{preview.references.length > preview.sample.length ? <p>Mostrando {preview.sample.length} de {preview.references.length} referências.</p> : null}{preview.rejected.length ? <p>{preview.rejected.length} trecho(s) foram ignorados por não seguirem a estrutura esperada.</p> : null}</section><div className="flex flex-wrap gap-2"><button type="button" className="admin-button secondary" disabled={busy} onClick={() => setPreview(null)}>Voltar</button><button type="button" className="admin-button primary" disabled={busy} onClick={() => void request("apply")}>{busy ? "Importando…" : "Confirmar importação"}</button></div></>}</div></details>;
}
