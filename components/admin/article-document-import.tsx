"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type StructureStatus = "selecionada" | "documento" | "sem_marcador" | "caminho_incompleto" | "ambiguo" | "nao_encontrado" | "conflito";
type Operation = "criar" | "preencher" | "preservar" | "vincular";
type Reference = {
  ordem: string;
  identification: string;
  legislation: string;
  operation: Operation;
  structureId: number | null;
  structureStatus: StructureStatus;
  structureTrail?: string[];
  structurePath: string | null;
  structureCandidates: string[];
  structureReason: string;
  existingId: string | null;
  existingUpdatedAt: string | null;
  existingHasStructure: boolean;
  linkExisting: boolean;
};
type Preview = { references: Reference[]; rejected: string[]; blockers: Array<{ ordem: string; reason: string }>; canConfirm: boolean; structures: Array<{ id: number; path: string }> };

function operationLabel(reference: Reference) {
  if (reference.operation === "criar") return "Criará um novo bloco com texto e estrutura.";
  if (reference.operation === "preencher") return "Preencherá o bloco existente sem texto, na estrutura válida indicada.";
  if (reference.operation === "vincular") return "Vinculará a estrutura sem alterar o texto existente.";
  return "Texto existente será preservado.";
}

function canChooseStructure(reference: Reference) {
  return ["sem_marcador", "caminho_incompleto", "ambiguo", "nao_encontrado"].includes(reference.structureStatus);
}

export function ArticleDocumentImport({ law }: { law: string; structures?: Array<{ id: number; nome: string; path?: string }> }) {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [structureSelections, setStructureSelections] = useState<Record<string, number>>({});
  const [linkExisting, setLinkExisting] = useState<Set<string>>(new Set());

  function expectedReferences(current: Preview) {
    return current.references.map(({ ordem, identification, legislation, operation, structureId, structureStatus, existingId, existingUpdatedAt, linkExisting: shouldLink }) => ({ ordem, identification, legislation, operation, structureId, structureStatus, existingId, existingUpdatedAt, linkExisting: shouldLink }));
  }

  async function request(action: "preview" | "apply", nextSelections = structureSelections, nextLinkExisting = linkExisting) {
    if (!file) { setError("Selecione um documento DOCX, TXT ou Markdown."); return; }
    setBusy(true); setError("");
    try {
      const form = new FormData();
      form.set("action", action); form.set("law", law); form.set("file", file);
      form.set("structure_selections", JSON.stringify(nextSelections));
      form.set("link_existing", JSON.stringify([...nextLinkExisting]));
      if (action === "apply" && preview) form.set("expected", JSON.stringify(expectedReferences(preview)));
      const response = await fetch("/api/admin/artigos/importar-documento", { method: "POST", body: form });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(typeof result.error === "string" ? result.error : "Não foi possível processar o documento.");
      if (action === "preview") { setStructureSelections(nextSelections); setLinkExisting(nextLinkExisting); setPreview(result as Preview); }
      else { setPreview(null); setFile(null); setStructureSelections({}); setLinkExisting(new Set()); router.refresh(); }
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Não foi possível processar o documento."); } finally { setBusy(false); }
  }

  function chooseStructure(ordem: string, rawValue: string) {
    const next = { ...structureSelections };
    if (rawValue) next[ordem] = Number(rawValue); else delete next[ordem];
    void request("preview", next);
  }

  function toggleLinkExisting(ordem: string) {
    const next = new Set(linkExisting);
    if (next.has(ordem)) next.delete(ordem); else next.add(ordem);
    void request("preview", structureSelections, next);
  }

  return <details className="article-reference-reset"><summary>Importar legislação de um documento</summary><div className="mt-3 grid gap-3">
    <p>Envie o texto oficial <strong>integral</strong> da lei em DOCX, TXT ou Markdown. Cada bloco precisa indicar uma estrutura ativa da mesma lei. Título 1 abre um bloco legal; Título 2 a 6 registram o caminho estrutural (Parte, Livro, Título, Capítulo, Seção ou Subseção). O sistema não associa um capítulo apenas pelo nome.</p>
    <input type="file" accept=".docx,.txt,.md,text/plain,application/vnd.openxmlformats-officedocument.wordprocessingml.document" onChange={(event) => { setFile(event.target.files?.[0] ?? null); setPreview(null); setStructureSelections({}); setLinkExisting(new Set()); setError(""); }} />
    {error ? <p className="admin-alert error" role="alert">{error}</p> : null}
    {!preview ? <button type="button" className="admin-button secondary" disabled={busy || !file} onClick={() => void request("preview")}>{busy ? "Lendo documento…" : "Gerar prévia da importação"}</button> : <>
      <section className="admin-alert"><strong>Prévia: {preview.references.length} bloco(s)</strong><p>{preview.references.filter((item) => item.operation === "criar").length} novo(s), {preview.references.filter((item) => item.operation === "preencher").length} preenchimento(s), {preview.references.filter((item) => item.operation === "vincular").length} vínculo(s) sem alteração de texto e {preview.references.filter((item) => item.operation === "preservar").length} texto(s) preservado(s).</p>{!preview.canConfirm ? <p className="mt-2 font-bold text-red-800">Confirmação bloqueada: resolva os marcadores e conflitos estruturais indicados abaixo. Nenhum inventário será gravado enquanto houver pendências.</p> : null}</section>
      <section className="grid gap-3" aria-label="Blocos do documento na prévia">{preview.references.map((item) => <article className={`rounded-xl border p-4 ${item.structureId && item.structureStatus !== "conflito" ? "border-slate-200 bg-white" : "border-red-200 bg-red-50"}`} key={item.ordem}><header className="flex flex-wrap items-start justify-between gap-3"><div><p className="font-mono text-sm font-bold text-slate-600">Ordem {item.ordem}</p><h3 className="mt-1 font-black text-slate-950">{item.identification}</h3></div><span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-bold text-slate-700">{item.operation}</span></header><p className="mt-2 text-sm text-slate-700">{operationLabel(item)}</p><p className="mt-2 text-sm"><strong>Estrutura cadastrada:</strong> {item.structurePath || "não resolvida"}</p>{item.structureTrail?.length ? <p className="mt-1 text-sm text-slate-600"><strong>Marcador no documento:</strong> {item.structureTrail.join(" › ")}</p> : null}<p className={`mt-2 text-sm ${item.structureId && item.structureStatus !== "conflito" ? "text-emerald-800" : "font-semibold text-red-800"}`}>{item.structureReason}</p>{item.structureCandidates.length ? <p className="mt-2 text-sm text-slate-600">Caminhos concorrentes: {item.structureCandidates.join(" | ")}</p> : null}{canChooseStructure(item) ? <label className="mt-3 grid gap-1 text-sm font-bold">Escolher estrutura para este bloco<select value={structureSelections[item.ordem] ? String(structureSelections[item.ordem]) : ""} disabled={busy} onChange={(event) => chooseStructure(item.ordem, event.target.value)}><option value="">Selecione uma estrutura ativa</option>{preview.structures.map((structure) => <option key={structure.id} value={structure.id}>{structure.path}</option>)}</select></label> : null}{item.existingId && !item.existingHasStructure && item.structureId ? <button type="button" className="admin-button secondary mt-3" disabled={busy} onClick={() => toggleLinkExisting(item.ordem)}>{item.linkExisting ? "Cancelar vínculo sem alterar texto" : "Vincular sem alterar texto"}</button> : null}</article>)}</section>
      {preview.rejected.length ? <p className="admin-alert error">{preview.rejected.length} trecho(s) foram ignorados por não seguirem a estrutura esperada. Revise o documento antes de confirmar.</p> : null}
      <div className="flex flex-wrap gap-2"><button type="button" className="admin-button secondary" disabled={busy} onClick={() => setPreview(null)}>Voltar</button><button type="button" className="admin-button primary" disabled={busy || !preview.canConfirm} onClick={() => void request("apply")}>{busy ? "Importando…" : "Confirmar importação"}</button></div>
    </>}</div></details>;
}
