"use client";

import { useMemo, useState } from "react";

type Reference = { id: string; ordem: string; identification: string; storedIdentification: string; legislation: string | null };
type Piece = { ordem: string; identificacao: string; legislacao: string };
type Preview = {
  kind: "unificar" | "separar";
  target?: { id: string; ordem: string; reference: string; legislation: string; updatedAt: string };
  sources?: Array<{ id: string; ordem: string; reference: string; updatedAt: string }>;
  archiveIds?: string[];
  source?: { id: string; ordem: string; reference: string; updatedAt: string };
  pieces?: Array<Piece & { reference: string }>;
  dependencies: Array<{ kind: string; ordem: string; detail: string }>;
  impact: Array<{ questionId: string; ordem: string; before: string | null; after: string | null }>;
  requiresCommentDecision: boolean;
};

function directParagraphs(html: string) {
  const parts = html.match(/<p\b[^>]*>[\s\S]*?<\/p>/gi) ?? [];
  return parts.length > 1 && parts.join("").replace(/>\s+</g, "><").trim() === html.replace(/>\s+</g, "><").trim() ? parts : null;
}

async function request(body: unknown) {
  const response = await fetch("/api/admin/artigos/composicao-blocos", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const payload = await response.json() as Preview & { error?: string };
  if (!response.ok || payload.error) throw new Error(payload.error ?? "Não foi possível gerar a prévia.");
  return payload;
}

export function ArticleBlockComposition({ law, references }: { law: string; references: Reference[] }) {
  const [selected, setSelected] = useState<string[]>([]);
  const [mode, setMode] = useState<"unificar" | "separar" | null>(null);
  const [cuts, setCuts] = useState<number[]>([]);
  const [pieces, setPieces] = useState<Piece[]>([]);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [commentTreatment, setCommentTreatment] = useState(false);
  const picked = useMemo(() => references.filter((item) => selected.includes(item.id)), [references, selected]);
  const splitSource = picked.length === 1 ? picked[0] : null;
  const paragraphs = splitSource?.legislation ? directParagraphs(splitSource.legislation) : null;

  function toggle(id: string) { setPreview(null); setError(""); setSelected((current) => current.includes(id) ? current.filter((value) => value !== id) : [...current, id]); }
  function start(next: "unificar" | "separar") {
    setError(""); setPreview(null); setMode(next); setConfirmation(""); setCommentTreatment(false);
    if (next === "separar" && splitSource && paragraphs) setCuts([]);
  }
  function buildPieces() {
    if (!splitSource || !paragraphs) return [];
    const boundaries = new Set(cuts);
    const groups: string[][] = [[]];
    paragraphs.forEach((paragraph, index) => { if (index > 0 && boundaries.has(index)) groups.push([]); groups.at(-1)!.push(paragraph); });
    return groups.map((group, index) => ({ ordem: index === 0 ? splitSource.ordem : "", identificacao: index === 0 ? splitSource.storedIdentification : "", legislacao: group.join("") }));
  }
  async function makePreview() {
    setLoading(true); setError("");
    try {
      const splitPieces = mode === "separar" ? (pieces.length ? pieces : buildPieces()) : undefined;
      if (mode === "separar" && (!splitPieces || splitPieces.length < 2)) throw new Error("Escolha ao menos um ponto de corte antes de gerar a prévia.");
      const result = await request({ action: "preview", law, mode, reference_ids: selected, pieces: splitPieces });
      setPieces(splitPieces ?? []); setPreview(result);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Não foi possível gerar a prévia."); }
    finally { setLoading(false); }
  }
  async function apply() {
    if (!preview || confirmation !== (preview.kind === "unificar" ? "UNIFICAR BLOCOS" : "SEPARAR BLOCO") || !commentTreatment) return;
    setLoading(true); setError("");
    try {
      const expected = { sources: preview.kind === "unificar" ? preview.sources : preview.source ? [preview.source] : [] };
      await request({ action: "apply", operation: preview, expected, comment_treatment: "preservar_e_sinalizar_revisao" });
      window.location.reload();
    } catch (caught) { setError(caught instanceof Error ? caught.message : "A confirmação não foi aplicada."); setLoading(false); }
  }

  return <section className="article-block-composition" aria-labelledby="block-composition-title">
    <header><div><p className="admin-eyebrow">Composição de blocos</p><h2 id="block-composition-title">Unificar ou separar texto legislativo</h2><p>Escolha blocos desta página. A prévia verifica referências, vínculos e a resolução real das questões antes de qualquer alteração.</p></div><span>{selected.length} selecionado(s)</span></header>
    <div className="article-block-picker" role="group" aria-label="Blocos disponíveis nesta página">
      {references.map((item) => <label key={item.id}><input type="checkbox" checked={selected.includes(item.id)} onChange={() => toggle(item.id)} /><span><strong>{item.identification}</strong><small><code>{item.ordem}</code>{item.legislation ? " · texto preparado" : " · sem texto"}</small></span></label>)}
    </div>
    <div className="article-block-composition-actions"><button type="button" className="admin-button secondary" onClick={() => start("unificar")} disabled={selected.length < 2}>Unificar selecionados</button><button type="button" className="admin-button secondary" onClick={() => start("separar")} disabled={selected.length !== 1}>Separar bloco selecionado</button></div>
    {mode === "separar" ? <section className="article-block-split"><h3>Pontos de corte</h3>{!splitSource?.legislation ? <p className="admin-alert error">O bloco selecionado não tem texto preparado.</p> : !paragraphs ? <p className="admin-alert error">Este HTML não pode ser separado automaticamente com segurança. Edite o bloco em trechos &lt;p&gt; antes de usar esta ferramenta.</p> : <><p>Marque o trecho que inicia cada novo bloco. Depois informe a Ordem e a identificação de cada parte nova; nada é inferido.</p>{paragraphs.map((paragraph, index) => <label key={index} className="article-block-cut"><input type="checkbox" disabled={index === 0} checked={cuts.includes(index)} onChange={() => setCuts((current) => current.includes(index) ? current.filter((value) => value !== index) : [...current, index])}/><span><strong>{index === 0 ? "Início do bloco original" : `Cortar antes do trecho ${index + 1}`}</strong><span dangerouslySetInnerHTML={{ __html: paragraph }} /></span></label>)}</>}
      {pieces.length > 1 ? <div className="article-block-pieces">{pieces.map((piece, index) => <label key={index}>Trecho {index + 1}{index === 0 ? " (mantém UUID)" : ""}<input value={piece.ordem} onChange={(event) => setPieces((all) => all.map((entry, itemIndex) => itemIndex === index ? { ...entry, ordem: event.target.value } : entry))} placeholder="Ordem" disabled={index === 0}/><input value={piece.identificacao} onChange={(event) => setPieces((all) => all.map((entry, itemIndex) => itemIndex === index ? { ...entry, identificacao: event.target.value } : entry))} placeholder="Identificação do dispositivo" /><small>{piece.legislacao.replace(/<[^>]+>/g, " ").slice(0, 140)}</small></label>)}</div> : null}
    </section> : null}
    {mode ? <button type="button" className="admin-button primary" onClick={() => { if (mode === "separar" && !pieces.length) setPieces(buildPieces()); else void makePreview(); }} disabled={loading}>{loading ? "Gerando prévia…" : mode === "unificar" ? "Gerar prévia da unificação" : pieces.length ? "Gerar prévia da separação" : "Continuar para detalhes dos trechos"}</button> : null}
    {error ? <p className="admin-alert error" role="alert">{error}</p> : null}
    {preview ? <section className="article-block-preview"><h3>Prévia da {preview.kind}</h3>{preview.kind === "unificar" && preview.target ? <><p><strong>Destino:</strong> {preview.target.reference} · <code>{preview.target.ordem}</code></p><p><strong>Serão arquivados, sem apagar:</strong> {preview.archiveIds?.length ?? 0} bloco(s).</p></> : null}{preview.kind === "separar" ? <p><strong>O UUID original fica no primeiro trecho.</strong> Os novos trechos terão blocos novos; questões preservam UUID e Ordem.</p> : null}<details open><summary>Impacto previsto nas questões ({preview.impact.length})</summary><p>{preview.impact.filter((item) => item.before !== item.after).length} questão(ões) passarão a resolver em outro bloco; suas Ordens não serão alteradas.</p></details><details open><summary>Vínculos encontrados ({preview.dependencies.length})</summary>{preview.dependencies.length ? <ul>{preview.dependencies.map((item, index) => <li key={`${item.kind}-${item.ordem}-${index}`}><code>{item.ordem}</code> · {item.detail}</li>)}</ul> : <p>Nenhum vínculo direto encontrado.</p>}</details><label className="article-block-confirm"><input type="checkbox" checked={commentTreatment} onChange={(event) => setCommentTreatment(event.target.checked)}/> Preservar os comentários no bloco de origem e sinalizá-los para revisão; não distribuí-los automaticamente.</label><label>Digite <code>{preview.kind === "unificar" ? "UNIFICAR BLOCOS" : "SEPARAR BLOCO"}</code> para confirmar.<input value={confirmation} onChange={(event) => setConfirmation(event.target.value)} autoComplete="off" /></label><button type="button" className="admin-button danger" disabled={loading || !commentTreatment || confirmation !== (preview.kind === "unificar" ? "UNIFICAR BLOCOS" : "SEPARAR BLOCO")} onClick={() => void apply()}>Confirmar {preview.kind}</button></section> : null}
  </section>;
}
