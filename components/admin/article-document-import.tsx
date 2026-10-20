"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Reference = { ordem: string; identification: string; legislation: string; operation: "criar" | "preencher" | "preservar"; displayLegislation?: string };
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
  return <details className="article-reference-reset"><summary>Importar legislação de um documento</summary><div className="mt-3 grid gap-3"><p>Envie o texto oficial <strong>integral</strong> da lei em DOCX, TXT ou Markdown. Além de preparar a leitura, a importação registra o inventário usado para detectar artigos sombra. No DOCX, use <strong>Título 1</strong> somente para <code>Art. 1º</code>. O parágrafo normativo seguinte pode começar por <code>Art. 1º - ...</code> ou pelo caput diretamente: o importador mantém o identificador visível sem duplicá-lo. Cada <code>§ 1º</code> numerado forma um bloco próprio. Parágrafo único, incisos e alíneas permanecem na leitura do bloco anterior.</p><input type="file" accept=".docx,.txt,.md,text/plain,application/vnd.openxmlformats-officedocument.wordprocessingml.document" onChange={(event) => { setFile(event.target.files?.[0] ?? null); setPreview(null); setError(""); }} />{error ? <p className="admin-alert error">{error}</p> : null}{!preview ? <button type="button" className="admin-button secondary" disabled={busy || !file} onClick={() => void request("preview")}>{busy ? "Lendo documento…" : "Gerar prévia da importação"}</button> : <><section className="admin-alert"><strong>Prévia: {preview.references.length} referência(s)</strong><p>{preview.references.filter((item) => item.operation === "criar").length} nova(s), {preview.references.filter((item) => item.operation === "preencher").length} base(s) vazia(s) preenchida(s) e {preview.references.filter((item) => item.operation === "preservar").length} base(s) preparada(s) preservada(s). Ao confirmar, estas {preview.references.length} referências formarão o inventário oficial para a conferência de artigos sombra.</p><div className="grid gap-3"><strong>Como os primeiros blocos ficarão na leitura</strong>{preview.sample.slice(0, 3).map((item) => <article className="rounded-xl border border-slate-200 bg-white p-4" key={item.ordem}><small className="font-bold text-slate-500">ordem {item.ordem}</small><h3 className="mt-1 text-lg font-black">{item.identification}</h3><p className="text-sm text-slate-600">{item.operation === "preservar" ? "Texto já preparado — será preservado." : item.operation === "preencher" ? "Preencherá uma referência sem texto." : "Criará uma nova referência."}</p><div className="legisbot-legal-html mt-3" dangerouslySetInnerHTML={{ __html: item.displayLegislation ?? "" }} /></article>)}</div><details className="mt-3"><summary>Ver lista estrutural da prévia ({preview.sample.length} primeiros blocos)</summary><ul>{preview.sample.map((item) => <li key={item.ordem}><code>{item.ordem}</code> · {item.identification} — {item.operation}</li>)}</ul></details>{preview.references.length > preview.sample.length ? <p>Mostrando a leitura dos 3 primeiros e a lista dos {preview.sample.length} primeiros de {preview.references.length} referências.</p> : null}{preview.rejected.length ? <p>{preview.rejected.length} trecho(s) foram ignorados por não seguirem a estrutura esperada.</p> : null}</section><div className="flex flex-wrap gap-2"><button type="button" className="admin-button secondary" disabled={busy} onClick={() => setPreview(null)}>Voltar</button><button type="button" className="admin-button primary" disabled={busy} onClick={() => void request("apply")}>{busy ? "Importando…" : "Confirmar importação"}</button></div></>}</div></details>;
}
