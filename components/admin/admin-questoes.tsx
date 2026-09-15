"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { lawDisplayName, type QuestionAnswer } from "@/lib/admin-questoes";
import { AdminQuestionAnkiTools } from "@/components/admin/admin-question-anki-tools";
import { AdminQuestionEditor, adminQuestionFormFrom, blankAdminQuestionForm, type AdminQuestionForm } from "@/components/admin/admin-question-editor";
import { LawScopesPanel } from "@/components/admin/admin-question-scopes";
import { LawSearchSelect } from "@/components/law-search-select";
import { LawStructureAdmin, type AdminLawStructureNode } from "@/components/admin/law-structure-admin";

type Law = { id: number; slug: string; titulo: string; nome_curto: string | null; codigo: string | null };
type Node = AdminLawStructureNode;
type Q = { id: string; structure_id: number | null; pergunta: string; resposta: QuestionAnswer; ordem: string; justificativa: string | null; assunto: string | null; legislacao: string | null; titulo: string | null; total_artigos: number | null; capitulo: string | null; secao: string | null; subsecao: string | null; artigo: string | null };
type Form = AdminQuestionForm;
const blank = blankAdminQuestionForm;

async function api<T>(url: string, init?: RequestInit) { const response = await fetch(url, { ...init, headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) } }); const body = await response.json().catch(() => ({})); if (!response.ok) throw new Error(body.error || "Erro na operação."); return body as T; }

export default function AdminQuestoes() {
  const [laws, setLaws] = useState<Law[]>([]); const [slug, setSlug] = useState(""); const [nodes, setNodes] = useState<Node[]>([]); const [questions, setQuestions] = useState<Q[]>([]); const [form, setForm] = useState<Form>(blank()); const [editing, setEditing] = useState<string | null>(null); const [saving, setSaving] = useState(false); const [error, setError] = useState(""); const ref = useRef<HTMLDivElement>(null);
  const searchParams = useSearchParams(); const initialLawSlug = searchParams.get("law_slug"); const initialQuestionId = searchParams.get("question_id");
  const law = laws.find((item) => item.slug === slug); const map = useMemo(() => new Map(nodes.map((item) => [item.id, item])), [nodes]);
  const path = (id: number | null) => { const result: Node[] = []; for (let node = id ? map.get(id) : undefined; node; node = node.parent_id ? map.get(node.parent_id) : undefined) result.unshift(node); return result; };
  useEffect(() => { void api<{ laws: Law[] }>("/api/admin/questoes").then(async (result) => { setLaws(result.laws); if (!initialLawSlug || !result.laws.some((law) => law.slug === initialLawSlug)) return; setSlug(initialLawSlug); const loaded = await api<{ structure: Node[]; questions: Q[] }>(`/api/admin/questoes?law_slug=${encodeURIComponent(initialLawSlug)}`); setNodes(loaded.structure); setQuestions(loaded.questions); const selected = loaded.questions.find((question) => question.id === initialQuestionId); if (selected) { setEditing(selected.id); setForm(adminQuestionFormFrom(selected)); } }).catch((caught) => setError(caught.message)); }, [initialLawSlug, initialQuestionId]);
  useEffect(() => { if (initialQuestionId && editing) ref.current?.scrollIntoView({ behavior: "smooth", block: "start" }); }, [editing, initialQuestionId]);
  async function load(lawSlug: string) { const result = await api<{ structure: Node[]; questions: Q[] }>(`/api/admin/questoes?law_slug=${encodeURIComponent(lawSlug)}`); setNodes(result.structure); setQuestions(result.questions); }
  async function save(event: React.FormEvent) { event.preventDefault(); setSaving(true); try { await api("/api/admin/questoes", { method: "POST", body: JSON.stringify({ action: editing ? "atualizar" : "criar", law_slug: slug, id: editing, data: form }) }); setForm((current) => ({ ...current, pergunta: "", resposta: "Certo", justificativa: "", assunto: "", legislacao: "" })); setEditing(null); await load(slug); } catch (caught) { setError(caught instanceof Error ? caught.message : "Erro"); } finally { setSaving(false); } }
  function editQuestion(question: Q) { setEditing(question.id); setForm(adminQuestionFormFrom(question)); ref.current?.scrollIntoView({ behavior: "smooth" }); }
  const selectedLaw = laws.find((item) => item.slug === slug);
  if (selectedLaw) return <QuestionManagementLayout laws={laws} law={selectedLaw} slug={slug} nodes={nodes} questions={questions} form={form} editing={editing} saving={saving} error={error} ref={ref} path={path} onReload={() => load(slug)} onSelect={(nextSlug) => { setSlug(nextSlug); void load(nextSlug); }} onEdit={editQuestion} onChange={setForm} onSave={save} />;
  if (!laws.length) return <p className="commercial-loading">Carregando leis…</p>;
  return <section className="commercial-admin admin-questoes">{error && <p className="admin-alert error">{error}</p>}<article className="commercial-card"><h2>Questões por lei</h2><LawSearchSelect value={slug} onChange={(nextSlug) => { setSlug(nextSlug); if (nextSlug) void load(nextSlug); }} options={laws.map((item) => ({ id: item.slug, titulo: lawDisplayName(item), slug: item.slug, codigo: item.codigo }))} /></article></section>;
}

function QuestionManagementLayout(props: { laws: Law[]; law: Law; slug: string; nodes: Node[]; questions: Q[]; form: Form; editing: string | null; saving: boolean; error: string; ref: React.RefObject<HTMLDivElement | null>; path: (id: number | null) => Node[]; onReload: () => Promise<void>; onSelect: (slug: string) => void; onEdit: (question: Q) => void; onChange: React.Dispatch<React.SetStateAction<Form>>; onSave: (event: React.FormEvent) => Promise<void> }) {
  const { laws, law, slug, nodes, questions, form, editing, saving, error, ref, path, onReload, onSelect, onEdit, onChange, onSave } = props;
  const saved = editing ? questions.find((question) => question.id === editing) : null;
  const update = <K extends keyof Form>(key: K, value: Form[K]) => onChange((current) => ({ ...current, [key]: value }));
  return <section className="commercial-admin admin-questoes question-admin-v2">
    {error && <p className="admin-alert error">{error}</p>}
    <article className="commercial-card question-law-picker"><h2>Banco de questões</h2><LawSearchSelect value={slug} onChange={onSelect} options={laws.map((item) => ({ id: item.slug, titulo: lawDisplayName(item), slug: item.slug, codigo: item.codigo }))} /></article>
    <LawScopesPanel lawSlug={law.slug} />
    <LawStructureAdmin lawSlug={law.slug} nodes={nodes} onReload={onReload} onDeleteComplete={(ids) => { if (form.structure_id && ids.includes(form.structure_id)) update("structure_id", null); }} onSelectNode={(node) => { update("structure_id", node.id); ref.current?.scrollIntoView({ behavior: "smooth" }); }} />
    <AdminQuestionAnkiTools lawSlug={law.slug} lawName={lawDisplayName(law)} onImported={onReload} />
    <div ref={ref}><AdminQuestionEditor lawName={lawDisplayName(law)} nodes={nodes} value={form} original={saved ? adminQuestionFormFrom(saved) : null} editing={Boolean(editing)} saving={saving} onChange={onChange} onSubmit={(event) => void onSave(event)} /></div>
    <article className="commercial-card"><h2>Questões cadastradas</h2>{questions.map((question) => <p key={question.id}>#{question.ordem} · {question.pergunta.replace(/<[^>]*>/g, "").slice(0, 90)} · {path(question.structure_id).map((item) => item.nome).join(" › ") || "Sem estrutura"} <button type="button" className="admin-link-button" onClick={() => onEdit(question)}>Editar</button></p>)}</article>
  </section>;
}
