"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { parseArticleMappingCsvObjects } from "@/lib/article-mapping-csv";

type Row = {
  slug: string; ordem: string; assunto: string; referencia_amigavel: string; legislacao_consolidada: string;
  quantidade_questoes: number; conflito: boolean; incidencia: string; artigo_recente: boolean;
  origem_mapeamento: string; observacao_interna: string; confianca: string | number; legisbot_id?: number | null; origem_contexto?: "questoes" | "legisbot";
};
type Preview = { resumo: { encontrados: number; atualizar: number; iguais: number; inexistentes: number } };
const confirmationPhrase = "APLICAR MAPEAMENTO";
const csv = (rows: Row[]) => [
  "slug,ordem,assunto,referencia_amigavel,legislacao_consolidada,quantidade_questoes,conflito,incidencia,artigo_recente,origem_mapeamento,observacao_interna,confianca",
  ...rows.map((row) => [row.slug, row.ordem, row.assunto, row.referencia_amigavel, row.legislacao_consolidada, row.quantidade_questoes, row.conflito, row.incidencia, row.artigo_recente, row.origem_mapeamento, row.observacao_interna, row.confianca].map((value) => JSON.stringify(value ?? "")).join(",")),
].join("\n");

export function ArticleMappingCenter({ law }: { law: string }) {
  const [rows, setRows] = useState<Row[]>([]);
  const [filter, setFilter] = useState("");
  const [fileRows, setFileRows] = useState<Record<string, unknown>[]>([]);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [confirmation, setConfirmation] = useState("");
  const [message, setMessage] = useState("");
  const load = useCallback(async () => {
    const response = await fetch(`/api/admin/artigos/mapeamento?lei=${encodeURIComponent(law)}`);
    const body = await response.json();
    if (response.ok) setRows(body);
    else setMessage(body.error ?? "Não foi possível carregar o mapeamento.");
  }, [law]);
  useEffect(() => { void load(); }, [load]);

  const visible = useMemo(() => rows.filter((row) => filter === "" || filter === row.incidencia), [rows, filter]);
  const download = () => {
    const url = URL.createObjectURL(new Blob([csv(rows)], { type: "text/csv;charset=utf-8" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `mapeamento-${law || "artigos"}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  };
  const read = async (file: File) => {
    try {
      const parsed = parseArticleMappingCsvObjects(await file.text()).map((row) => ({
        ...row,
        artigo_recente: row.artigo_recente === "true",
        confianca: row.confianca === "" ? null : Number(row.confianca),
      }));
      setFileRows(parsed);
      setConfirmation("");
      setMessage("");
      const response = await fetch("/api/admin/artigos/mapeamento", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "previsualizar_importacao", rows: parsed }) });
      const body = await response.json();
      if (response.ok) setPreview(body);
      else setMessage(body.error ?? "Não foi possível gerar a prévia.");
    } catch (error) {
      setPreview(null);
      setFileRows([]);
      setMessage(error instanceof Error ? error.message : "Não foi possível ler o CSV.");
    }
  };
  const apply = async () => {
    const response = await fetch("/api/admin/artigos/mapeamento", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "aplicar_importacao", rows: fileRows, confirmation }) });
    const body = await response.json();
    setMessage(response.ok ? `${body.atualizar} contexto(s) atualizados.` : body.error);
    if (response.ok) { setPreview(null); setConfirmation(""); await load(); }
  };

  return <section className="grid gap-4">
    <header className="article-comments-heading"><div><h2>Mapeamento por artigo</h2><p>Metadados editoriais de contextos existentes; não alteram questões, legislação ou conflitos.</p></div><div className="article-header-actions">{law ? <Link className="admin-button primary" href={`/estudar/lei/${encodeURIComponent(law)}/legiscast`} target="_blank">Visualizar no LegisCast ↗</Link> : null}<button className="admin-button secondary" type="button" onClick={download}>Exportar CSV</button></div></header>
    <div className="commercial-card flex flex-wrap gap-3">
      <label>Incidência<select value={filter} onChange={(event) => setFilter(event.target.value)}><option value="">Todas</option><option value="nao_mapeado">Não mapeadas</option><option value="muito_alta">Muito alta</option><option value="alta">Alta</option><option value="media">Média</option><option value="baixa">Baixa</option></select></label>
      <label>Importar CSV<input type="file" accept=".csv,text/csv" onChange={(event) => event.target.files?.[0] && void read(event.target.files[0])}/></label>
    </div>
    {preview ? <section className="admin-alert"><strong>Prévia da importação</strong><p>{preview.resumo.encontrados} encontrados · {preview.resumo.atualizar} atualizarão · {preview.resumo.iguais} iguais · {preview.resumo.inexistentes} inexistentes.</p><p>Contextos inexistentes não serão criados nem terão questões modificadas.</p><label>Digite <code>{confirmationPhrase}</code> para confirmar<input value={confirmation} onChange={(event) => setConfirmation(event.target.value)}/></label><button className="admin-button primary" type="button" disabled={confirmation !== confirmationPhrase} onClick={() => void apply()}>Confirmar importação</button></section> : null}
    {message ? <p className="admin-alert">{message}</p> : null}
    <div className="article-result-list">{visible.map((row) => <article className="article-result" key={`${row.slug}:${row.ordem}`}><div><strong>{row.referencia_amigavel || row.assunto}</strong><p>Incidência: {row.incidencia.replaceAll("_", " ")} · {row.artigo_recente ? "Artigo recente" : "Não recente"}</p><small>{row.slug} · {row.ordem} · {row.quantidade_questoes} questão(ões){row.origem_contexto === "legisbot" ? " · Contexto do LegisBot" : ""}{row.conflito ? " · Conflito" : ""}</small></div>{row.quantidade_questoes > 0 ? <Link className="admin-button secondary" href={`/admin/artigos/${encodeURIComponent(row.slug.toLowerCase())}/${encodeURIComponent(row.ordem)}?aba=mapeamento&lei=${encodeURIComponent(law || row.slug.toLowerCase())}`}>Abrir artigo</Link> : row.legisbot_id ? <Link className="admin-button secondary" href={`/admin/legisbot/${encodeURIComponent(String(row.legisbot_id))}`}>Abrir contexto editorial</Link> : null}</article>)}</div>
  </section>;
}
