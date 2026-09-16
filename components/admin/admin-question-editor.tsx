"use client";

import { useMemo } from "react";
import { QuestionRichEditor } from "@/components/admin/question-rich-editor";
import { QUESTION_ANSWERS, type QuestionAnswer, type QuestionDraft } from "@/lib/admin-questoes";
import { compareQuestionStructureNames } from "@/lib/questoes-structure";
import { plainQuestionText } from "@/lib/admin-question-search";

export type AdminQuestionStructureNode = { id: number; parent_id: number | null; tipo: "titulo" | "capitulo" | "secao" | "subsecao"; nome: string; ordem: number };
export type AdminQuestionForm = QuestionDraft;

const kinds = ["titulo", "capitulo", "secao", "subsecao"] as const;
const labels = { titulo: "Título", capitulo: "Capítulo", secao: "Seção", subsecao: "Subseção" } as const;

export const blankAdminQuestionForm = (): AdminQuestionForm => ({ structure_id: null, pergunta: "", resposta: "Certo", ordem: "1", justificativa: "", assunto: "", legislacao: "", titulo: "", total_artigos: null, capitulo: "", secao: "", subsecao: "", artigo: "" });

export function adminQuestionFormFrom(question: AdminQuestionForm): AdminQuestionForm {
  return { structure_id: question.structure_id, pergunta: question.pergunta, resposta: question.resposta, justificativa: question.justificativa, assunto: question.assunto, legislacao: question.legislacao, ordem: question.ordem, titulo: question.titulo, total_artigos: question.total_artigos, capitulo: question.capitulo, secao: question.secao, subsecao: question.subsecao, artigo: question.artigo };
}

export function AdminQuestionEditor({ lawName, nodes, value, original, editing, saving, error, onChange, onSubmit, onCancel, onPrevious, onNext, onDuplicate, onMove, onDelete, showPreview = false }: { lawName: string; nodes: AdminQuestionStructureNode[]; value: AdminQuestionForm; original: AdminQuestionForm | null; editing: boolean; saving: boolean; error?: string; onChange: (value: AdminQuestionForm) => void; onSubmit: (event: React.FormEvent<HTMLFormElement>) => void; onCancel?: () => void; onPrevious?: () => void; onNext?: () => void; onDuplicate?: () => void; onMove?: () => void; onDelete?: () => void; showPreview?: boolean }) {
  const map = useMemo(() => new Map(nodes.map((node) => [node.id, node])), [nodes]);
  const path = (id: number | null) => { const result: AdminQuestionStructureNode[] = []; for (let node = id ? map.get(id) : undefined; node; node = node.parent_id ? map.get(node.parent_id) : undefined) result.unshift(node); return result; };
  const level = (kind: AdminQuestionStructureNode["tipo"]) => path(value.structure_id).find((node) => node.tipo === kind)?.id ?? null;
  const kids = (parentId: number | null, kind: AdminQuestionStructureNode["tipo"]) => nodes.filter((node) => node.parent_id === parentId && node.tipo === kind).sort(compareQuestionStructureNames);
  const update = <K extends keyof AdminQuestionForm>(key: K, next: AdminQuestionForm[K]) => onChange({ ...value, [key]: next });
  const dirty = JSON.stringify(value) !== JSON.stringify(original ?? blankAdminQuestionForm());

  return <article className="commercial-card question-editor-card">
    <header><div><p className="question-editor-eyebrow">{lawName}</p><h2 id="admin-question-editor-title">{editing ? "Editar questão" : "Cadastrar questão"}</h2><p>{dirty ? "Alterações não salvas" : editing ? "Alterações salvas" : "Preencha os dados da nova questão"}</p></div></header>
	    {error ? <p className="admin-alert error" role="alert">{error}</p> : null}
	    {editing && (onPrevious || onNext || onDuplicate || onMove || onDelete) ? <nav className="flex flex-wrap gap-2 border-b border-slate-200 px-4 py-3 sm:px-6" aria-label="Ações da questão"><button type="button" className="admin-button secondary" disabled={saving || !onPrevious} onClick={onPrevious}>← Questão anterior</button><button type="button" className="admin-button secondary" disabled={saving || !onNext} onClick={onNext}>Próxima questão →</button><button type="button" className="admin-button secondary" disabled={saving} onClick={onDuplicate}>Duplicar</button><button type="button" className="admin-button secondary" disabled={saving} onClick={onMove}>Mover para outra estrutura</button><button type="button" className="admin-button danger ml-auto" disabled={saving} onClick={onDelete}>Excluir questão</button></nav> : null}
	    <form onSubmit={onSubmit} className="question-editor-form">
      <section><h3>Estrutura da questão</h3><div className="question-structure-grid">
        {kinds.map((kind, index) => { const parent = index ? level(kinds[index - 1]) : null; return <label key={kind}>{labels[kind]}<select value={level(kind) ?? ""} onChange={(event) => update("structure_id", event.target.value ? Number(event.target.value) : parent)}><option value="">Selecionar</option>{kids(parent, kind).map((node) => <option key={node.id} value={node.id}>{node.nome}</option>)}</select></label>; })}
        <label>Ordem<input required inputMode="decimal" value={value.ordem} onChange={(event) => update("ordem", event.target.value)} /></label>
        <label>Resposta<select value={value.resposta} onChange={(event) => update("resposta", event.target.value as QuestionAnswer)}>{QUESTION_ANSWERS.map((answer) => <option key={answer}>{answer}</option>)}</select></label>
      </div></section>
      <section><h3>Conteúdo</h3>
        <QuestionRichEditor label="Pergunta" required value={value.pergunta} onChange={(next) => update("pergunta", next)} />
        <QuestionRichEditor label="Justificativa" value={value.justificativa ?? ""} onChange={(next) => update("justificativa", next)} />
        <label className="question-subject">Assunto<textarea value={value.assunto ?? ""} onChange={(event) => update("assunto", event.target.value)} /></label>
        <QuestionRichEditor label="Legislação" value={value.legislacao ?? ""} onChange={(next) => update("legislacao", next)} />
      </section>
      <section><h3>Campos complementares e legados</h3><div className="question-structure-grid">
        <label>Artigo<input value={value.artigo ?? ""} onChange={(event) => update("artigo", event.target.value)} /></label>
        <label>Título legado<input value={value.titulo ?? ""} onChange={(event) => update("titulo", event.target.value)} /></label>
        <label>Total de artigos<input type="number" min="0" value={value.total_artigos ?? ""} onChange={(event) => update("total_artigos", event.target.value === "" ? null : Number(event.target.value))} /></label>
        <label>Capítulo legado<input value={value.capitulo ?? ""} onChange={(event) => update("capitulo", event.target.value)} /></label>
        <label>Seção legada<input value={value.secao ?? ""} onChange={(event) => update("secao", event.target.value)} /></label>
        <label>Subseção legada<input value={value.subsecao ?? ""} onChange={(event) => update("subsecao", event.target.value)} /></label>
      </div></section>
	      {showPreview ? <section aria-labelledby="question-preview-title"><h3 id="question-preview-title">Prévia para o aluno</h3><div className="rounded-xl border border-blue-100 bg-white p-4"><p className="text-sm text-slate-800">{plainQuestionText(value.pergunta) || "O enunciado aparecerá aqui."}</p><p className={`mt-3 inline-flex rounded-full px-2 py-1 text-xs font-black ${value.resposta === "Certo" ? "bg-emerald-100 text-emerald-800" : "bg-red-100 text-red-800"}`}>{value.resposta}</p>{value.justificativa ? <p className="mt-3 border-t border-slate-100 pt-3 text-sm text-slate-600">{plainQuestionText(value.justificativa)}</p> : null}</div></section> : null}
	      <footer><span className={dirty ? "is-dirty" : ""}>{dirty ? "● Alterações não salvas" : ""}</span><div className="flex flex-wrap gap-2">{onCancel ? <button type="button" className="admin-button secondary" disabled={saving} onClick={onCancel}>Cancelar</button> : null}{editing && onNext ? <button name="save-intent" value="next" className="admin-button secondary" disabled={saving || !dirty}>{saving ? "Salvando…" : "Salvar e ir para a próxima"}</button> : null}<button name="save-intent" value="stay" className="admin-button primary" disabled={saving || !dirty}>{saving ? "Salvando…" : editing ? "Salvar" : "Cadastrar questão"}</button></div></footer>
    </form>
  </article>;
}
