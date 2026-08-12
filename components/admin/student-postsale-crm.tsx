"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

type Row = Record<string, unknown>;
const text = (value: unknown) => value == null ? "" : String(value);
const date = (value: unknown) => value ? new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date(String(value))) : "—";
const firstName = (name: string) => name.trim().split(/\s+/)[0] || "aluno(a)";
const whatsappLink = (student: Row) => {
  const phone = text(student.telefone).replace(/\D/g, "");
  if (!phone) return "";
  const number = phone.startsWith("55") ? phone : `55${phone}`;
  const message = `Olá, ${firstName(text(student.nome))}! Tudo bem? Aqui é da Legis Flashcards.\n\nPassando para confirmar se você conseguiu acessar a nossa Central de Estudos e utilizar normalmente as questões no aplicativo.\n\nSe teve qualquer dificuldade para instalar, importar ou começar a estudar, pode me chamar por aqui que te ajudamos.`;
  return `https://wa.me/${number}?text=${encodeURIComponent(message)}`;
};
async function requestJson(url: string, init?: RequestInit) { const response = await fetch(url, { ...init, headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) } }); const data = await response.json().catch(() => ({})); if (!response.ok) throw new Error(text(data.error) || "Não foi possível concluir a ação."); return data; }

export function StudentPostSaleCrm({ student }: { student: Row }) {
  const [detail, setDetail] = useState<Row | null>(null); const [busy, setBusy] = useState(false); const [error, setError] = useState("");
  const id = text(student.id);
  const load = useCallback(async () => { setBusy(true); setError(""); try { setDetail(await requestJson("/api/admin/comercial/alunos", { method: "POST", body: JSON.stringify({ action: "crm_detalhe", id }) })); } catch (e) { setError(e instanceof Error ? e.message : "Não foi possível carregar o pós-venda."); } finally { setBusy(false); } }, [id]);
  useEffect(() => { void load(); }, [load]);
  const crm = (detail?.pos_venda ?? {}) as Row;
  const next = text(detail?.proxima_acao) || "Carregando…";
  const progress = Number(detail?.concluidas ?? 0); const total = Number(detail?.total_etapas ?? 6);
  const wa = useMemo(() => whatsappLink(student), [student]);
  async function update(action: string, status?: string) { setBusy(true); setError(""); try { await requestJson("/api/admin/comercial/alunos", { method: "POST", body: JSON.stringify({ action: "crm_atualizar", id, data: { tipo: action, status } }) }); await load(); } catch (e) { setError(e instanceof Error ? e.message : "Não foi possível salvar."); } finally { setBusy(false); } }
  return <section className="student-crm" aria-label="Mini-CRM de pós-venda">
    <header><div><small>FICHA DO ALUNO</small><h3>Mini-CRM de pós-venda</h3></div><span className="student-crm-account">{detail?.tem_acesso ? "Acesso ativo" : "Sem acesso ativo"}</span></header>
    {detail?.crm_disponivel === false ? <p className="admin-alert error" role="alert">{text(detail.crm_mensagem)}</p> : null}
    <div className="student-crm-summary"><div><small>PÓS-VENDA</small><strong>{progress} de {total} concluído</strong></div><div><small>PRÓXIMA AÇÃO</small><strong>{next}</strong></div></div>
    <div className="student-crm-quick">
      {wa ? <a className="admin-button primary" href={wa} target="_blank" rel="noreferrer" onClick={() => void update("whatsapp_aberto")}>WhatsApp</a> : <button className="admin-button secondary" disabled>Sem telefone</button>}
      <a className="admin-button secondary" href={`mailto:${encodeURIComponent(text(student.email))}`}>E-mail</a>
      {wa ? <button className="admin-button secondary" disabled={busy} onClick={() => void update("whatsapp_enviado")}>Confirmar WhatsApp enviado</button> : null}
    </div>
    {error ? <p className="admin-alert error">{error}</p> : null}
    <details open><summary>Checklist e uso das questões</summary><div className="student-crm-checklist">
      <p><b>Liberação:</b> {detail?.tem_acesso ? `ativa (${text(detail?.produtos_ativos)} produto(s))` : "sem acesso ativo"}</p>
      <p><b>E-mail de acesso:</b> {text(detail?.email_status) || "sem registro"}{detail?.email_em ? ` · ${date(detail?.email_em)}` : ""}</p>
      <p><b>Primeiro acesso:</b> {detail?.primeiro_acesso_em ? date(detail?.primeiro_acesso_em) : "ainda não registrado"}</p>
      <p><b>WhatsApp:</b> {crm.whatsapp_enviado_em ? `enviado em ${date(crm.whatsapp_enviado_em)}` : "pendente"}</p>
      <label>Conseguiu utilizar as questões?<select value={text(crm.uso_questoes_status) || "nao_confirmado"} disabled={busy} onChange={(e) => void update("uso_questoes", e.target.value)}><option value="nao_confirmado">Ainda não confirmado</option><option value="conseguiu_utilizar">Conseguiu utilizar</option><option value="precisa_ajuda">Precisa de ajuda</option><option value="problema_resolvido">Problema resolvido</option></select></label>
      <button className="admin-button secondary" disabled={busy} onClick={() => void update("suporte_concluido")}>Marcar suporte inicial concluído</button>
    </div></details>
    <details><summary>Histórico administrativo</summary><ol className="student-crm-history">{Array.isArray(detail?.historico) && detail.historico.length ? (detail.historico as Row[]).map((item) => <li key={text(item.id)}><b>{text(item.acao)}</b>{item.status ? `: ${text(item.status)}` : ""}<small>{date(item.created_at)}</small></li>) : <li>Nenhuma ação manual registrada.</li>}</ol></details>
  </section>;
}
