"use client";

import { useEffect, useState } from "react";

const incidencias = ["nao_mapeado", "baixa", "media", "alta", "muito_alta"] as const;
const origens = ["", "questoes_reais", "estimativa", "analogia", "manual", "ia"];
const incidenceLabels: Record<(typeof incidencias)[number], string> = {
  nao_mapeado: "Sem prioridade definida", baixa: "Prioridade baixa", media: "Prioridade média", alta: "Prioridade alta", muito_alta: "Prioridade muito alta",
};
type MappingData = { incidencia: (typeof incidencias)[number]; artigo_recente: boolean; origem_mapeamento: string; observacao_interna: string; confianca: string | number | null };
type InitialMappingData = { incidencia?: string | null; artigo_recente?: boolean | null; origem_mapeamento?: string | null; observacao_interna?: string | null; confianca?: string | number | null };
const empty: MappingData = { incidencia: "nao_mapeado", artigo_recente: false, origem_mapeamento: "", observacao_interna: "", confianca: "" };

function toConfidenceScale(value: string | number | null | undefined) {
  if (value == null || value === "") return "";
  const confidence = Number(value);
  return Number.isFinite(confidence) ? String(Math.round(confidence * 9 + 1)) : "";
}

function fromConfidenceScale(value: string | number | null) {
  if (value == null || value === "") return null;
  return (Number(value) - 1) / 9;
}

function normalizeInitial(initial: InitialMappingData | null | undefined): MappingData {
  return { ...empty, ...initial, incidencia: incidencias.includes(initial?.incidencia as MappingData["incidencia"]) ? initial!.incidencia as MappingData["incidencia"] : "nao_mapeado", artigo_recente: initial?.artigo_recente === true, origem_mapeamento: initial?.origem_mapeamento ?? "", observacao_interna: initial?.observacao_interna ?? "", confianca: toConfidenceScale(initial?.confianca) };
}

export function ArticleMapping({ slug, ordem, initial }: { slug: string; ordem: string; initial?: InitialMappingData | null }) {
  const [data, setData] = useState<MappingData>(() => normalizeInitial(initial));
  const [message, setMessage] = useState("");
  useEffect(() => {
    if (initial) { setData(normalizeInitial(initial)); return; }
    let active = true;
    void fetch(`/api/admin/artigos/mapeamento?lei=${encodeURIComponent(slug)}`).then((response) => response.ok ? response.json() : []).then((rows) => { const found = Array.isArray(rows) ? rows.find((row: { ordem?: string }) => row.ordem === ordem) : null; if (active && found) setData(normalizeInitial(found)); }).catch(() => undefined);
    return () => { active = false; };
  }, [initial, ordem, slug]);
  async function save() {
    const response = await fetch("/api/admin/artigos/mapeamento", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "salvar", slug, ordem, ...data, confianca: fromConfidenceScale(data.confianca) }) });
    const body = await response.json();
    setMessage(response.ok ? "Mapeamento salvo." : body.error || "Falha ao salvar.");
  }
  return <section className="article-legisbot article-mapping-card">
    <header><div><h2>Mapeamento por artigo</h2><p>Define a prioridade editorial exibida no LegisCast. Não altera questões, legislação ou conflitos.</p></div><div className="article-mapping-preview" aria-label={`Prévia: ${incidenceLabels[data.incidencia]}`}><span className={`article-mapping-flag article-mapping-flag--${data.incidencia}`} aria-hidden="true">⚑</span><span><strong>Prévia no LegisCast</strong>{data.artigo_recente ? " · recente" : ` · ${incidenceLabels[data.incidencia].toLowerCase()}`}</span></div></header>
    <div className="article-mapping-form">
      <label>Importância para revisão<select value={data.incidencia} onChange={(event) => setData({ ...data, incidencia: event.target.value as MappingData["incidencia"] })}>{incidencias.map((value) => <option key={value} value={value}>{incidenceLabels[value]}</option>)}</select><small>Escala visual: branco → vermelho.</small></label>
      <label className="article-mapping-recent"><input type="checkbox" checked={data.artigo_recente} onChange={(event) => setData({ ...data, artigo_recente: event.target.checked })} /><span><strong>Artigo recente</strong><small>Será marcado em azul no LegisCast.</small></span></label>
      <label>Origem da avaliação<select value={data.origem_mapeamento} onChange={(event) => setData({ ...data, origem_mapeamento: event.target.value })}>{origens.map((value) => <option key={value} value={value}>{value ? value.replaceAll("_", " ") : "Não informada"}</option>)}</select></label>
      <label>Confiança <span className="article-mapping-label-note">1 a 10</span><input type="number" min="1" max="10" step="1" value={data.confianca ?? ""} onChange={(event) => setData({ ...data, confianca: event.target.value })} /></label>
      <label className="article-mapping-notes">Observação interna<textarea rows={4} placeholder="Justificativa ou critério editorial usado neste mapeamento." value={data.observacao_interna} onChange={(event) => setData({ ...data, observacao_interna: event.target.value })} /></label>
    </div>
    <footer className="article-mapping-footer"><button className="admin-button primary" type="button" onClick={() => void save()}>Salvar mapeamento</button>{message ? <p role="status">{message}</p> : null}</footer>
  </section>;
}
