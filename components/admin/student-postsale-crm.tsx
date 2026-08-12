"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

type Row = Record<string, unknown>;
const text = (value: unknown) => value == null ? "" : String(value);
const obj = (value: unknown) => value && typeof value === "object" && !Array.isArray(value) ? value as Row : {};
const date = (value: unknown) => value ? new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date(String(value))) : "—";
const titles = ["Compra registrada", "Acesso liberado", "E-mail de acesso", "Primeiro acesso", "Confirmar acesso com o cliente", "Confirmar flashcards e Anki"];

async function json(url: string, init?: RequestInit) {
  const response = await fetch(url, { ...init, headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) } });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(text(data.error) || "Não foi possível concluir a ação.");
  return data;
}

export function StudentPostSaleCrm({ student, focusPurchase = "", onCycleUpdated }: { student: Row; focusPurchase?: string; onCycleUpdated?: () => void }) {
  const [cycles, setCycles] = useState<Row[]>([]);
  const [open, setOpen] = useState("");
  const [expandedPurchase, setExpandedPurchase] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const id = text(student.id);

  const load = useCallback(async () => {
    setBusy(true); setError("");
    try {
      const data = await json("/api/admin/comercial/alunos", { method: "POST", body: JSON.stringify({ action: "crm_compras", id }) });
      const loaded = data.cycles ?? [];
      setCycles(loaded);
      if (focusPurchase) {
        const cycle = loaded.find((item: Row) => text(item.id) === focusPurchase);
        if (cycle) { setExpandedPurchase(focusPurchase); setOpen(`${focusPurchase}:${Number(cycle.proxima_etapa) || 1}`); }
      }
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Não foi possível carregar o pós-venda."); }
    finally { setBusy(false); }
  }, [focusPurchase, id]);

  useEffect(() => { void load(); }, [load]);
  const phone = text(student.telefone).replace(/\D/g, "");
  const wa = useMemo(() => phone ? `https://wa.me/${phone.startsWith("55") ? phone : `55${phone}`}?text=${encodeURIComponent(`Olá, ${text(student.nome).split(/\s+/)[0] || "aluno(a)"}! Tudo bem? Aqui é da Legis Flashcards.\n\nPassando para confirmar se você conseguiu acessar a nossa Central de Estudos e utilizar normalmente as questões no aplicativo.`)}` : "", [phone, student.nome]);

  async function done(compra: string, etapa: number) {
    setBusy(true);
    try { await json("/api/admin/comercial/alunos", { method: "POST", body: JSON.stringify({ action: "crm_compra_atualizar", id: compra, data: { etapa } }) }); await load(); onCycleUpdated?.(); }
    catch (caught) { setError(caught instanceof Error ? caught.message : "Não foi possível salvar."); }
    finally { setBusy(false); }
  }

  return <section className="student-crm"><header><div><small>PÓS-VENDA</small><h3>Por compra</h3></div></header>
    {error ? <p className="admin-alert error">{error}</p> : null}
    {!busy && !cycles.length ? <p>Nenhuma compra ativa para acompanhar.</p> : cycles.map((cycle) => {
      const stages = Array.isArray(cycle.etapas) ? cycle.etapas as boolean[] : [];
      const next = Number(cycle.proxima_etapa) || 6;
      const key = text(cycle.id);
      const product = text(obj(cycle.produtos).nome) || "Produto";
      const releases = Array.isArray(cycle.liberacoes) ? cycle.liberacoes as Row[] : [];
      const expanded = expandedPurchase === key;
      return <article className="purchase-crm" key={key}>
        <button type="button" className="purchase-crm-summary" aria-expanded={expanded} onClick={() => setExpandedPurchase(expanded ? "" : key)}>
          <strong>{product}</strong><small>Compra em {date(cycle.adquirida_em)} · Aquisição {text(cycle.origem) || "registrada"} · {releases.length ? `${releases.length} liberação(ões) ativa(s)` : "Sem liberação vinculada"}</small>
          <b>{stages.filter(Boolean).length}/6 concluídas · Próxima: Etapa {next} — {titles[next - 1]}</b><span>{expanded ? "Ocultar pós-venda" : "Expandir pós-venda"}</span>
        </button>
        {expanded ? <><div className="purchase-releases"><strong>Liberações / aquisições desta compra</strong>{releases.length ? <ul>{releases.map((release) => <li key={text(release.id)}>{text(obj(release.leis).titulo) || "Acesso liberado"} · {text(release.origem) || "origem não informada"} · {date(release.concedida_em)}</li>)}</ul> : <p>Nenhuma liberação ativa vinculada a esta compra.</p>}</div>
          <div className="crm-stage-list">{titles.map((title, index) => <button key={title} type="button" className={stages[index] ? "done" : ""} onClick={() => setOpen(open === `${key}:${index + 1}` ? "" : `${key}:${index + 1}`)}><strong>Etapa {index + 1} — {title}</strong><span>{stages[index] ? "Concluída" : "Pendente"}</span></button>)}</div>
          {open.startsWith(`${key}:`) ? (() => {
            const stage = Number(open.split(":")[1]); const automatic = stage <= 4;
            const detail = stage === 1 ? "Compra localizada automaticamente no sistema." : stage === 2 ? "A aquisição ativa e as liberações vinculadas são verificadas pela fonte comercial." : stage === 3 ? text(obj(cycle.email).status) === "enviado" ? `E-mail registrado como enviado em ${date(obj(cycle.email).enviado_em)}.` : "Não há e-mail automático registrado para esta compra." : stage === 4 ? cycle.primeiro_acesso_em ? `Primeiro acesso identificado em ${date(cycle.primeiro_acesso_em)}.` : "Ainda não identificamos acesso à plataforma." : stage === 5 ? "Abra o WhatsApp, confirme o acesso à Central de Estudos e só então conclua a etapa." : "Confirme download, importação e uso dos flashcards/Anki antes de concluir.";
            return <div className="crm-stage-detail"><h4>Etapa {stage} — {titles[stage - 1]}</h4><p>{detail}</p><p><b>Status:</b> {stages[stage - 1] ? "Concluída" : "Pendente"}</p>{stage === 5 && wa ? <a className="admin-button primary" href={wa} target="_blank" rel="noreferrer">Abrir WhatsApp</a> : null}{!automatic ? <button className="admin-button secondary" disabled={busy || stages[stage - 1]} onClick={() => void done(key, stage)}>{stages[stage - 1] ? "Etapa concluída" : `Concluir Etapa ${stage}`}</button> : null}</div>;
          })() : null}
        </> : null}
      </article>;
    })}
  </section>;
}
