"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

type ConflictList = Awaited<ReturnType<typeof import("@/lib/admin-article-conflicts-server").listArticleSourceConflicts>>;
type Filters = { law?: string; type?: string; ordem_sort?: string };

const SESSION_KEY = "legisbot-conflicts-resolved-session";
const STRUCTURAL_BATCH_SESSION_KEY = "legisbot-conflicts-structural-batch";
const STRUCTURAL_BATCH_LIMIT = 100;
type ContextSelection = { slug: string; ordem: string };
type StructuralBatchPreview = { candidates: Array<ContextSelection & { expectedOrder: string; questionIds: string[] }>; excluded: Array<ContextSelection & { reason: string }> };
type ReferenceCleanupPreview = { law: string | null; candidates: Array<{ id: string; slug: string; ordem: string; before: string; after: string }>; sample: Array<{ id: string; slug: string; ordem: string; before: string; after: string }> };

async function requestStructuralBatch(body: Record<string, unknown>) {
  const response = await fetch("/api/admin/artigos/conflitos", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(typeof payload.error === "string" ? payload.error : "Não foi possível preparar a correção em lote.");
  return payload;
}

export function ArticleSourceConflicts({ data, filters }: { data: ConflictList; filters: Filters }) {
  const router = useRouter();
  const [selected, setSelected] = useState<ContextSelection[]>([]);
  const [batchPreview, setBatchPreview] = useState<StructuralBatchPreview | null>(null);
  const [referenceCleanupPreview, setReferenceCleanupPreview] = useState<ReferenceCleanupPreview | null>(null);
  const [confirmation, setConfirmation] = useState("");
  const [batchError, setBatchError] = useState("");
  const [batchBusy, setBatchBusy] = useState(false);
  const [selectionHydrated, setSelectionHydrated] = useState(false);
  useEffect(() => { try { const stored = JSON.parse(window.sessionStorage.getItem(STRUCTURAL_BATCH_SESSION_KEY) ?? "[]"); if (Array.isArray(stored)) setSelected(stored.filter((item): item is ContextSelection => Boolean(item) && typeof item.slug === "string" && typeof item.ordem === "string").slice(0, STRUCTURAL_BATCH_LIMIT)); } finally { setSelectionHydrated(true); } }, []);
  useEffect(() => { if (selectionHydrated) window.sessionStorage.setItem(STRUCTURAL_BATCH_SESSION_KEY, JSON.stringify(selected)); }, [selected, selectionHydrated]);
  const hrefForPage = (page: number) => {
    const params = new URLSearchParams({ aba: "conflitos" });
    for (const [key, value] of Object.entries(filters)) if (value) params.set(key === "law" ? "lei" : key === "type" ? "tipo" : key, value);
    params.set("pagina", String(page));
    return `/admin/artigos?${params}`;
  };
  const selectionKey = (item: ContextSelection) => `${item.slug}\u0000${item.ordem}`;
  const selectedKeys = new Set(selected.map(selectionKey));
  const toggle = (item: ContextSelection) => setSelected((current) => { if (current.some((value) => selectionKey(value) === selectionKey(item))) return current.filter((value) => selectionKey(value) !== selectionKey(item)); if (current.length >= STRUCTURAL_BATCH_LIMIT) { setBatchError("O lote pode conter até 100 contextos. Revise ou aplique as marcações atuais antes de adicionar outro."); return current; } return [...current, item]; });
  const safeForBatch = (item: ConflictList["items"][number]) => item.structuralValidation?.status === "conflict" && Boolean(item.structuralValidation.expectedOrder);
  async function previewBatch() { setBatchBusy(true); setBatchError(""); try { setBatchPreview(await requestStructuralBatch({ action: "previsualizar_lote_estrutural", contexts: selected }) as StructuralBatchPreview); setConfirmation(""); } catch (error) { setBatchError(error instanceof Error ? error.message : "Não foi possível preparar a correção em lote."); } finally { setBatchBusy(false); } }
  async function applyBatch() { setBatchBusy(true); setBatchError(""); try { const result = await requestStructuralBatch({ action: "aplicar_lote_estrutural", contexts: selected, confirmation }) as { applied: Array<ContextSelection>; failed: Array<ContextSelection & { reason: string }> }; setSelected([]); setBatchPreview(null); if (result.failed.length) setBatchError(`${result.applied.length} contexto(s) corrigido(s); ${result.failed.length} exigem revisão individual.`); router.refresh(); } catch (error) { setBatchError(error instanceof Error ? error.message : "Não foi possível aplicar a correção em lote."); } finally { setBatchBusy(false); } }
  async function previewReferenceCleanup() { setBatchBusy(true); setBatchError(""); try { setReferenceCleanupPreview(await requestStructuralBatch({ action: "previsualizar_limpeza_assuntos", law: filters.law ?? "" }) as ReferenceCleanupPreview); setConfirmation(""); } catch (error) { setBatchError(error instanceof Error ? error.message : "Não foi possível preparar a limpeza dos assuntos."); } finally { setBatchBusy(false); } }
  async function applyReferenceCleanup() { if (!referenceCleanupPreview) return; setBatchBusy(true); setBatchError(""); try { const result = await requestStructuralBatch({ action: "aplicar_limpeza_assuntos", law: filters.law ?? "", expected: referenceCleanupPreview.candidates.map(({ id, before, after }) => ({ id, before, after })), confirmation }) as { cleaned: number; failed: Array<{ id: string }> }; setReferenceCleanupPreview(null); setConfirmation(""); setBatchError(result.failed.length ? `${result.cleaned} assunto(s) limpo(s); ${result.failed.length} não puderam ser atualizados.` : result.cleaned ? "" : "Nenhum assunto precisava de limpeza."); router.refresh(); } catch (error) { setBatchError(error instanceof Error ? error.message : "Não foi possível limpar os assuntos."); } finally { setBatchBusy(false); } }
  return <section className="grid gap-5">
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
      <Indicator label="Estruturais" value={data.typeCounts.structural} />
      <Indicator label="Possíveis estruturais" value={data.typeCounts.possibleStructural} />
      <Indicator label="Legislação divergente" value={data.typeCounts.legislation} />
      <Indicator label="Granularidade" value={data.typeCounts.granularity} />
      <Indicator label="Comentários sem análise" value={data.typeCounts.commentWithoutAnalysis} />
    </div>
    <form className="commercial-card flex flex-wrap items-end gap-3">
      <input type="hidden" name="aba" value="conflitos" />
      <input type="hidden" name="lei" value={filters.law ?? ""} />
      <input type="hidden" name="ordem_sort" value={filters.ordem_sort ?? "asc"} />
      <label className="grid min-w-64 gap-1 font-bold">Tipo de revisão<select name="tipo" defaultValue={filters.type}><option value="">Todas as revisões</option><option value="estrutural">Conflito estrutural</option><option value="possivel_estrutural">Possível conflito estrutural</option><option value="legislacao">Divergência de legislação</option><option value="granularidade">Pendência editorial de granularidade</option><option value="comentario_sem_analise">Comentário sem análise</option></select></label>
      <div className="flex items-end gap-2"><button className="admin-button primary">Filtrar</button><Link className="admin-button secondary" href={`/admin/artigos?aba=conflitos${filters.law ? `&lei=${encodeURIComponent(filters.law)}` : ""}&ordem_sort=${filters.ordem_sort ?? "asc"}`}>Limpar</Link></div>
    </form>
    {batchError ? <p className="admin-alert error" role="alert">{batchError}</p> : null}
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3"><p className="text-sm text-slate-700"><strong>{selected.length}</strong> contexto(s) marcado(s). Apenas conflitos estruturais com ordem sugerida inequívoca entram no lote{filters.law ? ` da lei ${filters.law.toUpperCase()}` : ""}.</p><div className="flex flex-wrap gap-2"><button type="button" className="admin-button secondary" disabled={batchBusy} onClick={() => void previewReferenceCleanup()}>{batchBusy ? "Preparando…" : "Limpar HTML dos assuntos"}</button>{data.structuralSuggestions.length ? <button type="button" className="admin-button secondary" disabled={batchBusy} onClick={() => { setSelected(data.structuralSuggestions); setBatchError(""); }}>Sugerir lote{filters.law ? ` desta lei` : ""} ({data.structuralSuggestions.length})</button> : null}<button type="button" className="admin-button primary" disabled={!selected.length || batchBusy} onClick={() => void previewBatch()}>{batchBusy ? "Preparando…" : "Revisar ordens sugeridas"}</button></div></div>
    <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="article-section-title">Revisões e pendências</h2><span className="text-sm text-slate-600">{data.total} resultado(s) · página {data.page} de {data.pages}</span></div>
    {data.items.length ? <div className="grid gap-3">{data.items.map((item) => <article className="commercial-card grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center" key={`${item.slug}:${item.ordem}`}>
      <div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><label className="flex items-center gap-2 text-sm font-bold"><input type="checkbox" checked={selectedKeys.has(selectionKey(item))} disabled={!safeForBatch(item)} title={safeForBatch(item) ? "Marcar para correção da ordem sugerida" : "Este contexto não tem uma ordem sugerida segura para correção em lote"} onChange={() => toggle(item)} />Marcar para lote</label><strong className="text-lg">{item.lawTitle}</strong>{item.lawCode ? <span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-bold">{item.lawCode}</span> : null}</div><p className="mt-1 font-bold text-slate-700">{item.assunto || item.titulo || `Ordem ${item.ordem}`}</p><p className="mt-2 text-sm text-slate-600"><code>{item.slug}</code> · ordem <code>{item.ordem}</code> · {item.flashcards} flashcards · {item.versions} versões legais</p>{item.structuralValidation ? <p className="mt-2 text-sm text-amber-800"><strong>{item.structuralValidation.status === "conflict" ? "Conflito estrutural" : "Possível conflito"}:</strong> {item.structuralValidation.message}{item.structuralValidation.expectedOrder ? <> Ordem esperada: <code>{item.structuralValidation.expectedOrder}</code>.</> : null}</p> : null}{item.editorialGranularityPending ? <p className="mt-2 text-sm text-blue-800"><strong>Pendência editorial de granularidade:</strong> Recorte por inciso detectado — revisar granularidade da legislação.</p> : null}<p className="mt-2 text-sm">{item.comment ? <>LegisBot: <strong>{item.comment.status}</strong>{item.comment.precisa_revisao ? " · Precisa de revisão" : ""}</> : "Sem comentário do LegisBot"}</p></div>
      <Link className="admin-button primary" href={`/admin/artigos/${encodeURIComponent(item.slug.toLowerCase())}/${encodeURIComponent(item.ordem)}?aba=conflitos${filters.law ? `&lei=${encodeURIComponent(filters.law)}` : ""}`}>Analisar revisão</Link>
    </article>)}</div> : <div className="admin-empty"><h2>Nenhum conflito encontrado</h2><p>Duplicidades equivalentes são ignoradas automaticamente pelo mesmo normalizador do LegisBot.</p></div>}
    {batchPreview ? <div className="admin-modal-backdrop" role="presentation"><section className="admin-modal question-standardization-modal" role="dialog" aria-modal="true" aria-labelledby="structural-batch-title"><h2 id="structural-batch-title">Aplicar ordens sugeridas em lote</h2><p>{batchPreview.candidates.length} contexto(s) serão movidos para a ordem indicada pelo validador. Assunto e legislação não serão alterados.</p>{batchPreview.candidates.length ? <ul>{batchPreview.candidates.map((item) => <li key={selectionKey(item)}><code>{item.slug} · {item.ordem}</code> → <code>{item.expectedOrder}</code> · {item.questionIds.length} questão(ões)</li>)}</ul> : null}{batchPreview.excluded.length ? <section className="admin-alert"><strong>Fora do lote</strong><ul>{batchPreview.excluded.map((item) => <li key={selectionKey(item)}>{item.slug} · {item.ordem}: {item.reason}</li>)}</ul></section> : null}<label>Digite <strong>APLICAR ORDENS</strong> para autorizar<input autoFocus value={confirmation} onChange={(event) => setConfirmation(event.target.value)} placeholder="APLICAR ORDENS" /></label><p className="text-sm text-slate-600">Cada contexto será relido antes da alteração. Se um deles mudar ou não puder ser movido, os demais resultados serão informados separadamente.</p><div className="admin-modal-actions"><button type="button" className="admin-button secondary" disabled={batchBusy} onClick={() => setBatchPreview(null)}>Cancelar</button><button type="button" className="admin-button primary" disabled={batchBusy || confirmation !== "APLICAR ORDENS" || !batchPreview.candidates.length} onClick={() => void applyBatch()}>{batchBusy ? "Aplicando…" : "Autorizar solução em lote"}</button></div></section></div> : null}
    {referenceCleanupPreview ? <div className="admin-modal-backdrop" role="presentation"><section className="admin-modal question-standardization-modal" role="dialog" aria-modal="true" aria-labelledby="reference-cleanup-title"><h2 id="reference-cleanup-title">Limpar HTML dos assuntos em lote</h2><p>{referenceCleanupPreview.candidates.length} questão(ões){referenceCleanupPreview.law ? ` da lei ${referenceCleanupPreview.law.toUpperCase()}` : ""} terão apenas o campo Assunto normalizado.</p><p className="text-sm text-slate-600">A limpeza remove tags HTML, converte entidades e ajusta espaços. Pergunta, justificativa, legislação, respostas e ordem não serão alteradas.</p>{referenceCleanupPreview.sample.length ? <ul>{referenceCleanupPreview.sample.map((item) => <li key={item.id}><code>{item.slug} · {item.ordem}</code><br /><span className="line-through">{item.before}</span><br />→ {item.after}</li>)}</ul> : <p>Nenhum assunto precisa de limpeza.</p>}{referenceCleanupPreview.candidates.length > referenceCleanupPreview.sample.length ? <p className="text-sm text-slate-600">Mostrando {referenceCleanupPreview.sample.length} de {referenceCleanupPreview.candidates.length} alterações.</p> : null}<label>Digite <strong>LIMPAR ASSUNTOS</strong> para autorizar<input autoFocus value={confirmation} onChange={(event) => setConfirmation(event.target.value)} placeholder="LIMPAR ASSUNTOS" /></label><div className="admin-modal-actions"><button type="button" className="admin-button secondary" disabled={batchBusy} onClick={() => setReferenceCleanupPreview(null)}>Cancelar</button><button type="button" className="admin-button primary" disabled={batchBusy || confirmation !== "LIMPAR ASSUNTOS" || !referenceCleanupPreview.candidates.length} onClick={() => void applyReferenceCleanup()}>{batchBusy ? "Limpando…" : "Confirmar limpeza"}</button></div></section></div> : null}
    {data.pages > 1 ? <nav className="flex items-center justify-center gap-3" aria-label="Paginação de conflitos"><Link aria-disabled={data.page === 1} className={`admin-button secondary ${data.page === 1 ? "pointer-events-none opacity-50" : ""}`} href={hrefForPage(Math.max(1, data.page - 1))}>← Anterior</Link><span>{data.page} / {data.pages}</span><Link aria-disabled={data.page === data.pages} className={`admin-button secondary ${data.page === data.pages ? "pointer-events-none opacity-50" : ""}`} href={hrefForPage(Math.min(data.pages, data.page + 1))}>Próxima →</Link></nav> : null}
  </section>;
}

function Indicator({ label, value }: { label: string; value: number }) {
  return <article className="commercial-card"><span className="text-sm font-bold text-slate-500">{label}</span><strong className="mt-2 block text-3xl text-slate-900">{value}</strong></article>;
}

export const articleConflictSessionKey = SESSION_KEY;
