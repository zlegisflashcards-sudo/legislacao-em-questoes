"use client";

import { useActionState, useEffect, useMemo, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import Link from "next/link";
import { excluirComentario, salvarComentario, type AdminActionState } from "@/app/admin/actions";
import { LegisBotRichEditor } from "@/components/admin/legisbot-rich-editor";
import {
  LEGISBOT_COMENTARIO_STATUS,
  type LegisBotComentario,
  type LegisBotComentarioStatus,
} from "@/lib/legisbot-comentario";
import { legalHtmlToPlainText } from "@/lib/legisbot-community";
import { prepararComentarioParaEditor } from "@/lib/legisbot/prepare-comment-html";

type Fields = Pick<
  LegisBotComentario,
  "slug" | "ordem" | "titulo" | "assunto" | "legislacao" | "comentario" | "status" | "modelo_ia"
>;

const initialAction: AdminActionState = { ok: false, message: "" };
const emptyFields: Fields = {
  slug: "",
  ordem: "",
  titulo: "",
  assunto: "",
  legislacao: "",
  comentario: "",
  status: "pendente",
  modelo_ia: null,
};
const statusLabels: Record<LegisBotComentarioStatus, string> = {
  pendente: "Rascunho / pendente",
  processando: "Processando",
  concluido: "Publicado",
  erro: "Erro",
};
const snapshot = (value: Fields) => JSON.stringify(value);
const fromRecord = (record?: LegisBotComentario): Fields => record ? {
  slug: record.slug,
  ordem: record.ordem,
  titulo: record.titulo,
  assunto: record.assunto,
  legislacao: legalHtmlToPlainText(record.legislacao),
  comentario: record.comentario ?? "",
  status: record.status,
  modelo_ia: record.modelo_ia,
} : emptyFields;
const forEditor = (fields: Fields): Fields => ({
  ...fields,
  comentario: prepararComentarioParaEditor(fields.comentario),
});

export default function LegisBotEditor({ record }: { record?: LegisBotComentario }) {
  const storedInitial = useMemo(() => fromRecord(record), [record]);
  const initial = useMemo(() => forEditor(storedInitial), [storedInitial]);
  const [fields, setFields] = useState(initial);
  const [savedFields, setSavedFields] = useState(storedInitial);
  const [savedRecord, setSavedRecord] = useState(record);
  const [copied, setCopied] = useState<"legislacao" | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [state, action, pending] = useActionState(salvarComentario, initialAction);
  const identifiersConfirmedRef = useRef<HTMLInputElement>(null);
  const publicUrl = `/legisbot/${encodeURIComponent(savedFields.slug.toLowerCase())}/${encodeURIComponent(savedFields.ordem)}`;
  const dirty = snapshot(fields) !== snapshot(savedFields);
  const identifiersChanged = Boolean(savedRecord && (
    savedRecord.slug !== fields.slug.trim().toUpperCase()
    || savedRecord.ordem !== fields.ordem.trim()
  ));
  const canOpenPublic = Boolean(savedRecord && savedRecord.status === "concluido");

  useEffect(() => {
    if (!state.ok || !state.record) return;
    const effective = fromRecord(state.record);
    setSavedRecord(state.record);
    setFields(effective);
    setSavedFields(effective);
  }, [state]);

  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (dirty) event.preventDefault();
    };
    const warnLink = (event: MouseEvent) => {
      if (!dirty || event.defaultPrevented || event.button !== 0) return;
      const target = (event.target as HTMLElement).closest("a");
      if (target && !window.confirm("Há alterações não salvas. Deseja sair mesmo assim?")) {
        event.preventDefault();
      }
    };
    window.addEventListener("beforeunload", warn);
    document.addEventListener("click", warnLink);
    return () => {
      window.removeEventListener("beforeunload", warn);
      document.removeEventListener("click", warnLink);
    };
  }, [dirty]);

  function update<K extends keyof Fields>(key: K, value: Fields[K]) {
    setFields((current) => ({ ...current, [key]: value }));
  }

  async function copy(value: string, kind: "legislacao") {
    await navigator.clipboard.writeText(value);
    setCopied(kind);
    window.setTimeout(() => setCopied(null), 1600);
  }

  function confirmIdentifiers(event: React.FormEvent<HTMLFormElement>) {
    if (!identifiersChanged) return;
    const confirmed = window.confirm(
      "Slug e ordem identificam o comentário e alteram o link público. Confirma esta mudança?",
    );
    if (!confirmed) {
      event.preventDefault();
      return;
    }
    if (identifiersConfirmedRef.current) identifiersConfirmedRef.current.value = "yes";
  }

  const error = (field: keyof NonNullable<AdminActionState["fieldErrors"]>) =>
    state.fieldErrors?.[field] ? <span className="admin-field-error">{state.fieldErrors[field]}</span> : null;

  return <>
    <form action={action} className="admin-editor-form" onSubmit={confirmIdentifiers}>
      <input type="hidden" name="id" value={savedRecord?.id ?? ""} />
      <input ref={identifiersConfirmedRef} type="hidden" name="identifiers_confirmed" defaultValue="" />
      <header className="admin-detail-header">
        <div>
          <Link href="/admin/legisbot" className="admin-back">← Voltar para a listagem</Link>
          <div className="admin-detail-title-row">
            <h1>{savedRecord ? fields.titulo || "Comentário sem título" : "Adicionar comentário"}</h1>
            <span className={`admin-status status-${fields.status}`}>{statusLabels[fields.status]}</span>
          </div>
          <p>{savedRecord ? `${savedFields.slug} · ordem ${savedFields.ordem} · ID ${savedRecord.id}` : "Crie, revise e publique um comentário manualmente."}</p>
        </div>
        <div className="admin-save-actions">
          {canOpenPublic ? <Link className="admin-button secondary" href={publicUrl} target="_blank">Abrir página pública</Link> : null}
          <button name="intent" value="draft" type="submit" className="admin-button secondary" disabled={pending}>
            {pending ? "Salvando…" : "Salvar como rascunho"}
          </button>
          {savedRecord ? <button name="intent" value="save" type="submit" className="admin-button primary" disabled={pending || !dirty}>
            {pending ? "Salvando…" : "Salvar alterações"}
          </button> : null}
          <button name="intent" value="publish" type="submit" className="admin-button primary" disabled={pending}>
            {pending ? "Publicando…" : "Publicar"}
          </button>
        </div>
      </header>

      {dirty ? <div className="admin-unsaved">● Existem alterações ainda não salvas.</div> : null}
      {state.message ? <div className={`admin-alert ${state.ok ? "success" : "error"}`} role="status">
        {state.message}
        {state.existing ? <span className="admin-alert-actions">
          <Link href={`/admin/legisbot/${state.existing.id}`}>Abrir comentário existente</Link>
        </span> : null}
      </div> : null}

      <section className="admin-card">
        <div className="admin-section-title">
          <div><h2>Identificação e publicação</h2><p>Os campos marcados com * são obrigatórios.</p></div>
        </div>
        <div className="admin-fields-grid">
          <label>Slug da lei *
            <input name="slug" value={fields.slug} maxLength={50} required onChange={(e) => update("slug", e.target.value.toUpperCase())} aria-invalid={Boolean(state.fieldErrors?.slug)} />
            {error("slug")}
          </label>
          <label>Ordem *
            <input name="ordem" value={fields.ordem} maxLength={20} required onChange={(e) => update("ordem", e.target.value)} aria-invalid={Boolean(state.fieldErrors?.ordem)} />
            {error("ordem")}
          </label>
          <label>Título da lei *
            <input name="titulo" value={fields.titulo} maxLength={255} required onChange={(e) => update("titulo", e.target.value)} aria-invalid={Boolean(state.fieldErrors?.titulo)} />
            {error("titulo")}
          </label>
          <label>Artigo ou assunto *
            <input name="assunto" value={fields.assunto} maxLength={255} required onChange={(e) => update("assunto", e.target.value)} aria-invalid={Boolean(state.fieldErrors?.assunto)} />
            {error("assunto")}
          </label>
          <label>Status
            <select name="status" value={fields.status} onChange={(e) => update("status", e.target.value as LegisBotComentarioStatus)}>
              {LEGISBOT_COMENTARIO_STATUS.map((status) => <option key={status} value={status}>{statusLabels[status]}</option>)}
            </select>
            {error("status")}
          </label>
          <label>Modelo de IA
            <input name="modelo_ia" value={fields.modelo_ia ?? ""} maxLength={50} onChange={(e) => update("modelo_ia", e.target.value || null)} />
          </label>
          <div className="admin-readonly"><span>Criado em</span><strong>{savedRecord ? new Date(savedRecord.created_at).toLocaleString("pt-BR") : "Ao salvar"}</strong></div>
          <div className="admin-readonly"><span>Última atualização</span><strong>{savedRecord ? new Date(savedRecord.updated_at).toLocaleString("pt-BR") : "Ao salvar"}</strong></div>
        </div>
        <div className="admin-identifier-warning">
          <strong>Atenção:</strong> slug e ordem identificam o comentário. Alterá-los muda o link público e exige confirmação antes do salvamento.
        </div>
      </section>

      <section className="admin-card">
        <div className="admin-section-title">
          <div><h2>Texto literal da legislação *</h2><p>Texto-base exibido ao aluno e usado pelo LegisBot.</p></div>
          <button type="button" className="admin-button secondary small" onClick={() => copy(fields.legislacao, "legislacao")}>
            {copied === "legislacao" ? "Copiado!" : "Copiar legislação"}
          </button>
        </div>
        <textarea className="admin-legislation" name="legislacao" value={fields.legislacao} required aria-invalid={Boolean(state.fieldErrors?.legislacao)} onChange={(e) => update("legislacao", e.target.value)} />
        {error("legislacao")}
      </section>

      <LegisBotRichEditor
        value={fields.comentario ?? ""}
        error={state.fieldErrors?.comentario}
        onChange={(html) => update("comentario", html)}
      />

      <div className="admin-bottom-actions">
        <div>
          <Link className="admin-button secondary" href="/admin/legisbot">Voltar para a listagem</Link>
          {canOpenPublic ? <Link className="admin-button secondary" href={publicUrl} target="_blank">Abrir página pública</Link> : null}
        </div>
        <div>
          <button type="button" className="admin-button secondary" disabled={pending || !dirty} onClick={() => setFields(forEditor(savedFields))}>Descartar alterações</button>
          {savedRecord ? <button type="button" className="admin-button danger" onClick={() => setConfirmDelete(true)}>Excluir comentário</button> : null}
        </div>
      </div>
    </form>

    {confirmDelete && savedRecord ? <div className="admin-modal-backdrop" role="presentation">
      <div className="admin-modal" role="dialog" aria-modal="true" aria-labelledby="delete-title">
        <h2 id="delete-title">Excluir comentário?</h2>
        <dl>
          <div><dt>Legislação</dt><dd>{savedRecord.titulo} ({savedRecord.slug})</dd></div>
          <div><dt>Ordem</dt><dd>{savedRecord.ordem}</dd></div>
          <div><dt>Assunto</dt><dd>{savedRecord.assunto}</dd></div>
        </dl>
        <p className="admin-danger-note">Esta exclusão não poderá ser desfeita.</p>
        <div className="admin-modal-actions">
          <button className="admin-button secondary" onClick={() => setConfirmDelete(false)}>Cancelar</button>
          <form action={excluirComentario}><input type="hidden" name="id" value={savedRecord.id} /><DeleteButton /></form>
        </div>
      </div>
    </div> : null}
  </>;
}

function DeleteButton() {
  const { pending } = useFormStatus();
  return <button className="admin-button danger" disabled={pending}>{pending ? "Excluindo…" : "Confirmar exclusão"}</button>;
}
