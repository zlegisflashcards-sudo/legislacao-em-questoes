"use client";

import { useActionState, useEffect, useMemo, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import Link from "next/link";
import LegisBotCommentContent from "@/components/legisbot-comment-content";
import { excluirComentario, salvarComentario, type AdminActionState } from "@/app/admin/actions";
import { LEGISBOT_COMENTARIO_STATUS, type LegisBotComentario } from "@/lib/legisbot-comentario";

type Fields = Pick<LegisBotComentario, "titulo" | "assunto" | "legislacao" | "comentario" | "status" | "modelo_ia">;
const initialAction: AdminActionState = { ok: false, message: "" };
const snapshot = (value: Fields) => JSON.stringify(value);

export default function LegisBotEditor({ record }: { record: LegisBotComentario }) {
  const original = useMemo<Fields>(() => ({ titulo: record.titulo, assunto: record.assunto, legislacao: record.legislacao, comentario: record.comentario, status: record.status, modelo_ia: record.modelo_ia }), [record]);
  const [fields, setFields] = useState(original);
  const [savedFields, setSavedFields] = useState(original);
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState<"html" | "legislacao" | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [state, action, pending] = useActionState(salvarComentario, initialAction);
  const openAfterSave = useRef(false);
  const publicUrl = `/legisbot/${encodeURIComponent(record.slug.toLowerCase())}/${encodeURIComponent(record.ordem)}`;
  const dirty = snapshot(fields) !== snapshot(savedFields);

  useEffect(() => {
    if (state.ok) {
      setSavedFields(fields);
      if (openAfterSave.current) window.open(publicUrl, "_blank", "noopener,noreferrer");
      openAfterSave.current = false;
    }
  }, [state, publicUrl]);

  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => { if (dirty) event.preventDefault(); };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  function update<K extends keyof Fields>(key: K, value: Fields[K]) { setFields((current) => ({ ...current, [key]: value })); }
  async function copy(value: string, kind: "html" | "legislacao") {
    await navigator.clipboard.writeText(value); setCopied(kind); window.setTimeout(() => setCopied(null), 1600);
  }

  return <>
    <form action={action} className="admin-editor-form">
      <input type="hidden" name="id" value={record.id} />
      <header className="admin-detail-header"><div><Link href="/admin/legisbot" className="admin-back">← Voltar aos comentários</Link><h1>{record.titulo}</h1><p>{record.slug} · ordem {record.ordem} · ID {record.id}</p></div><div className="admin-save-actions"><Link className="admin-button secondary" href={publicUrl} target="_blank">Abrir página pública</Link><button type="submit" className="admin-button secondary" disabled={pending || !dirty} onClick={() => { openAfterSave.current = true; }}>{pending ? "Salvando…" : "Salvar e visualizar"}</button><button type="submit" className="admin-button primary" disabled={pending || !dirty}>{pending ? "Salvando…" : "Salvar alterações"}</button></div></header>
      {dirty ? <div className="admin-unsaved">● Existem alterações ainda não salvas.</div> : null}
      {state.message ? <div className={`admin-alert ${state.ok ? "success" : "error"}`} role="status">{state.message}</div> : null}
      <section className="admin-card admin-fields-grid">
        <label>Título<input name="titulo" value={fields.titulo} maxLength={255} required onChange={(e) => update("titulo", e.target.value)} /></label>
        <label>Assunto<input name="assunto" value={fields.assunto} maxLength={255} required onChange={(e) => update("assunto", e.target.value)} /></label>
        <label>Status<select name="status" value={fields.status} onChange={(e) => update("status", e.target.value as Fields["status"])}>{LEGISBOT_COMENTARIO_STATUS.map((status) => <option key={status}>{status}</option>)}</select></label>
        <label>Modelo de IA<input name="modelo_ia" value={fields.modelo_ia ?? ""} maxLength={50} onChange={(e) => update("modelo_ia", e.target.value || null)} /></label>
        <div className="admin-readonly"><span>Criado em</span><strong>{new Date(record.created_at).toLocaleString("pt-BR")}</strong></div>
        <div className="admin-readonly"><span>Atualizado em</span><strong>{new Date(record.updated_at).toLocaleString("pt-BR")}</strong></div>
      </section>
      <section className="admin-card"><div className="admin-section-title"><div><h2>Legislação</h2><p>Texto-base usado pelo LegisBot.</p></div><button type="button" className="admin-button secondary small" onClick={() => copy(fields.legislacao, "legislacao")}>{copied === "legislacao" ? "Copiado!" : "Copiar legislação"}</button></div><textarea className="admin-legislation" name="legislacao" value={fields.legislacao} required onChange={(e) => update("legislacao", e.target.value)} /></section>
      <section className={`admin-editor-grid ${expanded ? "expanded" : ""}`}>
        <div id="editor-html" className="admin-card admin-editor-pane"><div className="admin-section-title"><div><h2>HTML bruto</h2><p>Edição completa do comentário.</p></div><div><button type="button" className="admin-link-button" onClick={() => copy(fields.comentario ?? "", "html")}>{copied === "html" ? "Copiado!" : "Copiar HTML"}</button><button type="button" className="admin-link-button" onClick={() => setExpanded((value) => !value)}>{expanded ? "Reduzir" : "Expandir"}</button></div></div><textarea name="comentario" className="admin-html-editor" value={fields.comentario ?? ""} spellCheck={false} onChange={(e) => update("comentario", e.target.value)} /></div>
        {!expanded ? <div className="admin-card admin-preview-pane"><div className="admin-section-title"><div><h2>Pré-visualização</h2><p>HTML sanitizado, atualizado em tempo real.</p></div></div><div className="admin-preview bot-answer"><div className="answer-content answer-freeform"><LegisBotCommentContent html={fields.comentario ?? ""} /></div></div></div> : null}
      </section>
      <div className="admin-bottom-actions"><button type="button" className="admin-button secondary" disabled={pending || !dirty} onClick={() => setFields(savedFields)}>Descartar alterações</button><button type="button" className="admin-button danger" onClick={() => setConfirmDelete(true)}>Excluir registro</button></div>
    </form>
    {confirmDelete ? <div className="admin-modal-backdrop" role="presentation"><div className="admin-modal" role="dialog" aria-modal="true" aria-labelledby="delete-title"><h2 id="delete-title">Excluir comentário?</h2><dl><div><dt>Legislação</dt><dd>{record.titulo} ({record.slug})</dd></div><div><dt>Ordem</dt><dd>{record.ordem}</dd></div><div><dt>Assunto</dt><dd>{record.assunto}</dd></div></dl><p className="admin-danger-note">Esta exclusão não poderá ser desfeita.</p><div className="admin-modal-actions"><button className="admin-button secondary" onClick={() => setConfirmDelete(false)}>Cancelar</button><form action={excluirComentario}><input type="hidden" name="id" value={record.id} /><DeleteButton /></form></div></div></div> : null}
  </>;
}

function DeleteButton() {
  const { pending } = useFormStatus();
  return <button className="admin-button danger" disabled={pending}>{pending ? "Excluindo…" : "Confirmar exclusão"}</button>;
}
