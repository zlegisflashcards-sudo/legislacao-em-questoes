"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { StandardizableQuestion } from "@/components/admin/question-standardization-panel";
import { ArticleContextStandardizationTrigger } from "@/components/admin/article-context-standardization-trigger";
import { questionStructureIssues } from "@/lib/question-structure-consistency";

type Question = StandardizableQuestion & {
  pergunta: string; resposta: string; titulo: string | null; structure_id: number | null;
  legisbotResolution: { status: "vinculado" | "hierarquia" | "sem_legisbot"; ordem: string | null; legisbotId: number | null };
};
type BotOption = { id: number; ordem: string; titulo: string; assunto: string; status: string };
type ReferenceOption = { id: string; ordem: string; identificacao: string };
const statusLabel = { vinculado: "Comentário do LegisBot vinculado", hierarquia: "Comentário do LegisBot atendido por hierarquia", sem_legisbot: "Explicação do LegisBot indisponível" } as const;

export function ArticleQuestions({ lawSlug, slug, ordem, questions, legisbotCount, communityCount }: { lawSlug: string; slug: string; ordem: string; questions: Question[]; legisbotCount: number; communityCount: number }) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");
  const [bots, setBots] = useState<BotOption[]>([]);
  const [botId, setBotId] = useState("");
  const [loadingBots, setLoadingBots] = useState(false);
  const [referenceSearch, setReferenceSearch] = useState("");
  const [references, setReferences] = useState<ReferenceOption[]>([]);
  const [referenceId, setReferenceId] = useState("");
  const [loadingReferences, setLoadingReferences] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const selectedIds = useMemo(() => [...selected], [selected]);
  const distinctSubjects = new Set(questions.map((item) => item.assunto?.trim() || "")).size > 1;
  const distinctLegislation = new Set(questions.map((item) => item.legislacao?.trim() || "")).size > 1;

  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setLoadingBots(true);
      try {
        const response = await fetch(`/api/admin/artigos/legisbot-vinculos?slug=${encodeURIComponent(slug)}&q=${encodeURIComponent(search)}`, { signal: controller.signal });
        const data = await response.json() as { records?: BotOption[]; error?: string };
        if (!response.ok) throw new Error(data.error || "Não foi possível pesquisar os LegisBots.");
        setBots(data.records ?? []);
      } catch (error) { if (!controller.signal.aborted) setMessage(error instanceof Error ? error.message : "Não foi possível pesquisar os LegisBots."); }
      finally { if (!controller.signal.aborted) setLoadingBots(false); }
    }, 180);
    return () => { controller.abort(); window.clearTimeout(timer); };
  }, [slug, search]);

  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setLoadingReferences(true);
      try {
        const response = await fetch(`/api/admin/artigos/referencias-vinculos?slug=${encodeURIComponent(slug)}&q=${encodeURIComponent(referenceSearch)}`, { signal: controller.signal });
        const data = await response.json() as { records?: ReferenceOption[]; error?: string };
        if (!response.ok) throw new Error(data.error || "Não foi possível pesquisar os blocos legislativos.");
        setReferences(data.records ?? []);
      } catch (error) { if (!controller.signal.aborted) setMessage(error instanceof Error ? error.message : "Não foi possível pesquisar os blocos legislativos."); }
      finally { if (!controller.signal.aborted) setLoadingReferences(false); }
    }, 180);
    return () => { controller.abort(); window.clearTimeout(timer); };
  }, [slug, referenceSearch]);

  async function saveLink(remove = false) {
    if (!selectedIds.length) { setMessage("Selecione ao menos uma questão."); return; }
    if (!remove && !botId) { setMessage("Escolha um LegisBot para vincular."); return; }
    setSaving(true); setMessage("");
    try {
      const response = await fetch("/api/admin/artigos/legisbot-vinculos", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ question_ids: selectedIds, legisbot_id: remove ? null : Number(botId) }) });
      const data = await response.json() as { linked?: number; error?: string };
      if (!response.ok) throw new Error(data.error || "Não foi possível salvar o vínculo.");
      setMessage(remove ? "Vínculos removidos. Recarregue para conferir a cadeia hierárquica." : `${data.linked ?? selectedIds.length} questão(ões) vinculada(s). Recarregue para conferir.`);
    } catch (error) { setMessage(error instanceof Error ? error.message : "Não foi possível salvar o vínculo."); }
    finally { setSaving(false); }
  }

  async function saveReferenceLink(remove = false) {
    if (!selectedIds.length) { setMessage("Selecione ao menos uma questão."); return; }
    if (!remove && !referenceId) { setMessage("Escolha um bloco legislativo para vincular."); return; }
    setSaving(true); setMessage("");
    try {
      const response = await fetch("/api/admin/artigos/referencias-vinculos", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ question_ids: selectedIds, reference_id: remove ? null : referenceId }) });
      const data = await response.json() as { linked?: number; error?: string };
      if (!response.ok) throw new Error(data.error || "Não foi possível salvar o vínculo.");
      setMessage(remove ? "Vínculos legislativos removidos. A resolução voltará a usar a hierarquia." : `${data.linked ?? selectedIds.length} questão(ões) vinculada(s) ao bloco legislativo.`);
    } catch (error) { setMessage(error instanceof Error ? error.message : "Não foi possível salvar o vínculo."); }
    finally { setSaving(false); }
  }

  return <>
    {(distinctSubjects || distinctLegislation) ? <p className="article-issue">{distinctSubjects ? "Assuntos diferentes no grupo" : ""}{distinctSubjects && distinctLegislation ? " · " : ""}{distinctLegislation ? "Legislações diferentes no grupo" : ""}</p> : null}
    <div className="article-bulk-bar"><span>{questions.length} questão(ões) no contexto</span><ArticleContextStandardizationTrigger lawSlug={lawSlug} slug={slug} ordem={ordem} questions={questions} legisbotCount={legisbotCount} communityCount={communityCount} /></div>
    <section className="admin-card grid gap-3"><div><h3>Vincular bloco legislativo</h3><p className="article-interaction-note">Define explicitamente o texto legal desta questão. Sem vínculo manual, a resolução usa slug + Ordem e a cadeia hierárquica.</p></div><div className="article-header-actions"><label>Pesquisar<input value={referenceSearch} onChange={(event) => setReferenceSearch(event.target.value)} placeholder="Identificação, UUID ou ordem" /></label><label>Bloco preparado<select value={referenceId} onChange={(event) => setReferenceId(event.target.value)}><option value="">{loadingReferences ? "Pesquisando…" : "Escolher bloco"}</option>{references.map((reference) => <option value={reference.id} key={reference.id}>{reference.identificacao} · {reference.ordem}</option>)}</select></label><button type="button" className="admin-button primary" disabled={saving} onClick={() => void saveReferenceLink()}>{saving ? "Salvando…" : `Vincular selecionadas (${selectedIds.length})`}</button><button type="button" className="admin-button secondary" disabled={saving || !selectedIds.length} onClick={() => void saveReferenceLink(true)}>Remover vínculo</button></div></section>
    <section className="admin-card grid gap-3"><div><h3>Vincular comentário do LegisBot</h3><p className="article-interaction-note">Opcional e independente do bloco legislativo: controla somente a explicação do LegisBot.</p></div><div className="article-header-actions"><label>Pesquisar<input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Referência, artigo ou ordem" /></label><label>LegisBot<select value={botId} onChange={(event) => setBotId(event.target.value)}><option value="">{loadingBots ? "Pesquisando…" : "Escolher conteúdo"}</option>{bots.map((bot) => <option value={bot.id} key={bot.id}>{bot.assunto || bot.titulo} · {bot.ordem} · {bot.status}</option>)}</select></label><button type="button" className="admin-button primary" disabled={saving} onClick={() => void saveLink()}>{saving ? "Salvando…" : `Vincular selecionadas (${selectedIds.length})`}</button><button type="button" className="admin-button secondary" disabled={saving || !selectedIds.length} onClick={() => void saveLink(true)}>Remover vínculo</button></div>{message ? <p className="admin-alert" role="status">{message}</p> : null}</section>
    <div className="article-question-list">{questions.map((item) => { const issues = questionStructureIssues(item, { slug, ordem }); const checked = selected.has(item.id); return <article className="article-result" key={item.id}><label><input type="checkbox" checked={checked} onChange={() => setSelected((current) => { const next = new Set(current); if (next.has(item.id)) next.delete(item.id); else next.add(item.id); return next; })} aria-label={`Selecionar questão ${item.id}`} /></label><div><strong>{item.resposta}</strong><p>{item.pergunta.replace(/<[^>]+>/g, " ").slice(0, 240)}</p><small>{item.assunto ?? "Sem assunto"} · ordem {item.ordem} · estrutura {item.structure_id ?? "—"}</small><p className="article-interaction-note">{statusLabel[item.legisbotResolution.status]}{item.legisbotResolution.ordem ? ` · ordem ${item.legisbotResolution.ordem}` : ""}</p>{issues.length ? <p className="article-issue" title={issues.map((issue) => issue.label).join("; ")}>{issues[0].certainty === "possible" ? "Possível inconsistência" : issues[0].label}{issues.length > 1 ? ` +${issues.length - 1}` : ""}</p> : null}</div><Link className="admin-button secondary" href={`/admin/leis/${encodeURIComponent(item.slug.toLowerCase())}/questoes?question_id=${encodeURIComponent(item.id)}`}>Editar questão</Link></article>; })}</div>
  </>;
}
