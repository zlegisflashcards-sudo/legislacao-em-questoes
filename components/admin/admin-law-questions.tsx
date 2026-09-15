"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { AdminQuestionEditor, adminQuestionFormFrom, blankAdminQuestionForm, type AdminQuestionForm, type AdminQuestionStructureNode } from "@/components/admin/admin-question-editor";
import { adminQuestionSearchTerms, type AdminQuestionSearchFilter } from "@/lib/admin-question-search";

type Law = { id: number; slug: string; titulo: string };
type SearchResult = { id: string; structure_id: number | null; pergunta_trecho: string; resposta: "Certo" | "Errado"; artigo: string | null; assunto: string | null; ordem: string; updated_at: string };
type SearchResponse = { results: SearchResult[]; total: number; page: number; limit: number; pages: number };
type FullQuestion = AdminQuestionForm & { id: string };

const filters: Array<{ value: AdminQuestionSearchFilter; label: string }> = [{ value: "all", label: "Todas" }, { value: "certo", label: "Certo" }, { value: "errado", label: "Errado" }, { value: "unstructured", label: "Sem estrutura" }];

async function readJson(response: Response) {
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(typeof body.error === "string" ? body.error : "Não foi possível concluir a operação.");
  return body;
}

function HighlightedText({ text, query }: { text: string; query: string }) {
  const terms = adminQuestionSearchTerms(query).map((term) => term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  if (!terms.length) return <>{text}</>;
  const expression = new RegExp(`(${terms.join("|")})`, "gi");
  return <>{text.split(expression).map((part, index) => terms.some((term) => new RegExp(`^${term}$`, "i").test(part)) ? <mark className="rounded bg-amber-100 px-0.5" key={`${part}-${index}`}>{part}</mark> : part)}</>;
}

export function AdminLawQuestions({ law, initialStructure }: { law: Law; initialStructure: AdminQuestionStructureNode[] }) {
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [filter, setFilter] = useState<AdminQuestionSearchFilter>("all");
  const [page, setPage] = useState(1);
  const [results, setResults] = useState<SearchResult[]>([]);
  const [total, setTotal] = useState(0);
  const [pages, setPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<AdminQuestionForm>(blankAdminQuestionForm());
  const [original, setOriginal] = useState<AdminQuestionForm | null>(null);
  const [saving, setSaving] = useState(false);
  const [editorError, setEditorError] = useState("");
  const [refresh, setRefresh] = useState(0);
  const titleRef = useRef<HTMLDivElement>(null);
  const savingRef = useRef(false);
  const structureMap = useMemo(() => new Map(initialStructure.map((node) => [node.id, node])), [initialStructure]);
  const structurePath = (id: number | null) => { const names: string[] = []; for (let node = id ? structureMap.get(id) : undefined; node; node = node.parent_id ? structureMap.get(node.parent_id) : undefined) names.unshift(node.nome); return names.join(" › "); };

  useEffect(() => { const timeout = window.setTimeout(() => { setDebouncedQuery(query.trim()); setPage(1); }, 350); return () => window.clearTimeout(timeout); }, [query]);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setError("");
    const params = new URLSearchParams({ law_slug: law.slug, mode: "search", q: debouncedQuery, filter, page: String(page), limit: "30" });
    void fetch(`/api/admin/questoes?${params}`, { cache: "no-store", signal: controller.signal }).then(readJson).then((body: SearchResponse) => { setResults(body.results); setTotal(body.total); setPages(body.pages); }).catch((caught) => { if (caught instanceof DOMException && caught.name === "AbortError") return; setError(caught instanceof Error ? caught.message : "Não foi possível pesquisar as questões."); }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [law.slug, debouncedQuery, filter, page, refresh]);
  useEffect(() => { if (!editorOpen) return; const previousOverflow = document.body.style.overflow; const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null; const closeOnEscape = (event: KeyboardEvent) => { if (event.key === "Escape" && !savingRef.current) setEditorOpen(false); }; document.body.style.overflow = "hidden"; document.addEventListener("keydown", closeOnEscape); titleRef.current?.focus(); return () => { document.body.style.overflow = previousOverflow; document.removeEventListener("keydown", closeOnEscape); previousFocus?.focus(); }; }, [editorOpen]);

  function newQuestion() { setEditingId(null); setForm(blankAdminQuestionForm()); setOriginal(null); setEditorError(""); setEditorOpen(true); }
  async function editQuestion(id: string) {
    setEditorError(""); setError("");
    try {
      const params = new URLSearchParams({ law_slug: law.slug, question_id: id });
      const body = await fetch(`/api/admin/questoes?${params}`, { cache: "no-store" }).then(readJson) as { question: FullQuestion };
      const next = adminQuestionFormFrom(body.question); setEditingId(body.question.id); setForm(next); setOriginal(next); setEditorOpen(true);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Não foi possível abrir a questão."); }
  }
  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); savingRef.current = true; setSaving(true); setEditorError(""); setMessage("");
    try {
      await fetch("/api/admin/questoes", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: editingId ? "atualizar" : "criar", law_slug: law.slug, id: editingId, data: form }) }).then(readJson);
      setEditorOpen(false); setEditingId(null); setOriginal(null); setMessage(editingId ? "Questão atualizada." : "Questão cadastrada."); setRefresh((value) => value + 1);
    } catch (caught) { setEditorError(caught instanceof Error ? caught.message : "Não foi possível salvar a questão."); }
    finally { savingRef.current = false; setSaving(false); }
  }

  return <section className="grid gap-5">
    <header className="law-center-page-heading"><div><p className="law-center-kicker">Questões</p><h2>Localize e mantenha o conteúdo</h2><p>Pesquise apenas nesta lei e abra o editor completo sem perder o resultado atual.</p></div></header>
    <article className="commercial-card">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end"><label className="min-w-0 flex-1 text-base font-bold">Pesquisar questões<input autoFocus className="mt-1 min-h-14 w-full text-base" type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Ex.: afastamento do lar" /></label><button type="button" className="admin-button primary min-h-12 shrink-0" onClick={newQuestion}>Nova questão</button></div>
      <div className="mt-4 flex flex-wrap gap-2" aria-label="Filtrar questões">{filters.map((item) => <button key={item.value} type="button" className={`admin-button ${filter === item.value ? "primary" : "secondary"}`} aria-pressed={filter === item.value} onClick={() => { setFilter(item.value); setPage(1); }}>{item.label}</button>)}</div>
      <p className="mt-3 text-sm text-slate-600">{debouncedQuery ? `Resultados para “${debouncedQuery}” nesta lei.` : "Exibindo as questões atualizadas mais recentemente. Digite acima para pesquisar todo o conteúdo da lei."}</p>
    </article>
    {message ? <p className="admin-alert success" role="status">{message}</p> : null}{error ? <p className="admin-alert error" role="alert">{error}</p> : null}
    <section className="grid gap-3" aria-live="polite" aria-busy={loading}>
      <div className="flex items-center justify-between gap-3"><h2 className="text-lg font-black">Questões</h2><span className="text-sm text-slate-600">{total} encontrada(s)</span></div>
      {loading ? <p className="commercial-card commercial-loading">Pesquisando…</p> : results.map((question) => <button type="button" key={question.id} onClick={() => void editQuestion(question.id)} className="commercial-card grid w-full gap-2 text-left transition hover:border-blue-300 hover:shadow-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-600">
        <div className="flex flex-wrap items-center gap-2"><strong className="text-blue-800">#{question.ordem}</strong><span className={`rounded-full px-2 py-0.5 text-xs font-bold ${question.resposta === "Certo" ? "bg-emerald-100 text-emerald-800" : "bg-red-100 text-red-800"}`}>{question.resposta}</span>{question.artigo ? <span className="text-sm font-bold text-slate-700">{question.artigo}</span> : null}</div>
        <p className="line-clamp-3 text-sm text-slate-800"><HighlightedText text={question.pergunta_trecho || "Questão sem trecho disponível"} query={debouncedQuery} /></p>
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">{question.assunto ? <span>Assunto: {question.assunto}</span> : null}<span>Estrutura: {structurePath(question.structure_id) || "Sem estrutura"}</span></div>
      </button>)}
      {!loading && !results.length ? <article className="commercial-card law-center-empty"><h3 className="font-black">{debouncedQuery || filter !== "all" ? "Nenhuma questão encontrada" : "Esta lei ainda não possui questões"}</h3><p className="text-sm text-slate-600">{debouncedQuery || filter !== "all" ? "Tente outro termo ou altere o filtro selecionado." : "Cadastre a primeira questão ou use as ferramentas Anki para importar conteúdo existente."}</p><div className="flex flex-wrap gap-2"><button type="button" className="admin-button primary" onClick={newQuestion}>Cadastrar questão</button><Link className="admin-button secondary" href={`/admin/leis/${encodeURIComponent(law.slug)}/anki`}>Abrir Anki</Link></div></article> : null}
    </section>
    {pages > 1 ? <nav className="flex items-center justify-center gap-3" aria-label="Paginação das questões"><button type="button" className="admin-button secondary" disabled={loading || page <= 1} onClick={() => setPage((value) => Math.max(1, value - 1))}>Anterior</button><span className="text-sm">Página {page} de {pages}</span><button type="button" className="admin-button secondary" disabled={loading || page >= pages} onClick={() => setPage((value) => value + 1)}>Próxima</button></nav> : null}
    {editorOpen ? <div className="fixed inset-0 z-50 bg-slate-950/45" role="presentation"><div ref={titleRef} tabIndex={-1} className="absolute inset-0 overflow-y-auto bg-slate-50 p-3 outline-none sm:left-auto sm:w-[min(92vw,780px)] sm:p-5" role="dialog" aria-modal="true" aria-labelledby="admin-question-editor-title"><div className="mb-3 flex justify-end"><button type="button" className="admin-button secondary" disabled={saving} aria-label="Fechar editor de questão" onClick={() => setEditorOpen(false)}>Fechar</button></div><AdminQuestionEditor lawName={law.titulo} nodes={initialStructure} value={form} original={original} editing={Boolean(editingId)} saving={saving} error={editorError} onChange={setForm} onSubmit={(event) => void save(event)} onCancel={() => setEditorOpen(false)} /></div></div> : null}
  </section>;
}
