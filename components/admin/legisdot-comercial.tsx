"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import type { SalesReply, SalesTurn } from "@/lib/legisdot-comercial/types";
import styles from "./legisdot-comercial.module.css";

type Tab = "simulator" | "conversations" | "connection";
type Conversation = {
  id: string;
  displayName: string | null;
  senderLabel: string;
  status: "bot" | "human" | "opted_out";
  stage: string;
  lastInboundAt: string;
  updatedAt: string;
};
type Overview = {
  status: {
    mode: "disabled" | "shadow" | "live";
    configured: boolean;
    missing: string[];
    databaseReady: boolean;
    aiConfigured: boolean;
    webhookPath: string;
    allowlistRequired: boolean;
  };
  conversations: Conversation[];
  catalogCount: number;
};
type ConversationMessage = {
  id: string;
  inboundText: string;
  replyText: string | null;
  state: string;
  createdAt: string;
  deliveryStatus: string | null;
};
type SimulatedTurn = SalesTurn & { engine?: SalesReply["engine"]; stage?: string; handoff?: boolean; optOut?: boolean };

const quickMessages = ["Quero estudar grátis", "Como funciona?", "Preciso de ajuda com acesso", "Quero falar com uma pessoa"];
const stageLabels: Record<string, string> = {
  qualificacao: "Conhecendo o aluno", catalogo: "Escolha do material", compra: "Orientação de compra", suporte: "Suporte", humano: "Atendimento humano",
};
const conversationLabels: Record<Conversation["status"], string> = {
  bot: "Assistente", human: "Precisa de você", opted_out: "Contato interrompido",
};
const stateLabels: Record<string, string> = {
  pending: "Na fila", processing: "Preparando resposta", draft: "Rascunho", draft_ready: "Rascunho", ready: "Resposta pronta",
  sending: "Envio em andamento", accepted: "Aceita pelo WhatsApp", sent: "Enviada", delivered: "Entregue", read: "Lida",
  failed: "Falha", uncertain: "Envio a conferir", unknown: "Envio a conferir", human: "Encaminhada para você", ignored: "Sem resposta automática", completed: "Processada",
};

async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    credentials: "same-origin",
    cache: "no-store",
    headers: { "Content-Type": "application/json", ...init?.headers },
  });
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    if (response.status === 401 || response.status === 403) throw new Error("Sua sessão precisa ser validada. Entre novamente na administração.");
    throw new Error(typeof body?.error === "string" ? body.error : "Não foi possível concluir a operação. Tente novamente.");
  }
  return body as T;
}

function formatDate(value: string) {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? "Data indisponível" : new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short", timeStyle: "short", timeZone: "America/Sao_Paulo",
  }).format(parsed);
}

function StatusDot({ active = false }: { active?: boolean }) {
  return <span className={`${styles.dot} ${active ? styles.activeDot : ""}`} aria-hidden="true" />;
}

export default function LegisDotCommercial() {
  const [tab, setTab] = useState<Tab>("simulator");
  const [overview, setOverview] = useState<Overview | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [turns, setTurns] = useState<SimulatedTurn[]>([]);
  const [message, setMessage] = useState("");
  const [simulating, setSimulating] = useState(false);
  const [simulationError, setSimulationError] = useState("");
  const [useAI, setUseAI] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ConversationMessage[]>([]);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [messagesError, setMessagesError] = useState("");
  const [updatingConversation, setUpdatingConversation] = useState(false);
  const [notice, setNotice] = useState("");
  const latestLoad = useRef(0);
  const transcript = useRef<HTMLDivElement>(null);
  const selected = overview?.conversations.find((conversation) => conversation.id === selectedId) ?? null;

  const loadOverview = useCallback(async () => {
    const version = ++latestLoad.current;
    setLoading(true);
    setLoadError("");
    try {
      const data = await requestJson<Overview>("/api/admin/legisdot-comercial");
      if (version === latestLoad.current) setOverview(data);
    } catch (error) {
      if (version === latestLoad.current) setLoadError(error instanceof Error ? error.message : "Falha ao carregar o painel.");
    } finally {
      if (version === latestLoad.current) setLoading(false);
    }
  }, []);

  useEffect(() => { void loadOverview(); }, [loadOverview]);
  useEffect(() => {
    const element = transcript.current;
    if (element) element.scrollTop = element.scrollHeight;
  }, [turns, simulating]);
  useEffect(() => {
    if (!selectedId || tab !== "conversations") return;
    const controller = new AbortController();
    setMessages([]);
    setMessagesLoading(true);
    setMessagesError("");
    void requestJson<{ messages: ConversationMessage[] }>(`/api/admin/legisdot-comercial/conversas/${encodeURIComponent(selectedId)}`, { signal: controller.signal })
      .then((data) => { if (!controller.signal.aborted) setMessages(data.messages); })
      .catch((error) => { if (!controller.signal.aborted) setMessagesError(error instanceof Error ? error.message : "Falha ao abrir a conversa."); })
      .finally(() => { if (!controller.signal.aborted) setMessagesLoading(false); });
    return () => controller.abort();
  }, [selectedId, tab]);

  async function simulate(candidate: string) {
    const text = candidate.trim();
    if (!text || simulating || text.length > 2000) return;
    setSimulating(true);
    setSimulationError("");
    const history = turns.map(({ role, content }) => ({ role, content })).slice(-16);
    try {
      const result = await requestJson<{ reply: SalesReply; catalogCount: number }>("/api/admin/legisdot-comercial/simular", {
        method: "POST",
        body: JSON.stringify({ message: text, history, useAI: Boolean(useAI && overview?.status.aiConfigured) }),
      });
      setTurns((current) => [...current, { role: "user", content: text }, {
        role: "assistant", content: result.reply.text, engine: result.reply.engine,
        stage: result.reply.stage, handoff: result.reply.handoff, optOut: result.reply.optOut,
      }]);
      setMessage("");
      setOverview((current) => current ? { ...current, catalogCount: result.catalogCount } : current);
    } catch (error) {
      setSimulationError(error instanceof Error ? error.message : "Não foi possível simular a resposta.");
      setMessage(text);
    } finally {
      setSimulating(false);
    }
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    void simulate(message);
  }

  async function updateConversation(action: "pause" | "resume") {
    if (!selected || selected.status === "opted_out" || updatingConversation) return;
    setUpdatingConversation(true);
    setMessagesError("");
    setNotice("");
    try {
      await requestJson<{ ok: boolean }>(`/api/admin/legisdot-comercial/conversas/${encodeURIComponent(selected.id)}`, {
        method: "PATCH", body: JSON.stringify({ action }),
      });
      setNotice(action === "pause" ? "Assistente pausado para esta conversa. Você pode continuar o atendimento pelo WhatsApp." : "Assistente retomado. Novas mensagens seguirão a configuração de envio.");
      await loadOverview();
    } catch (error) {
      setMessagesError(error instanceof Error ? error.message : "Não foi possível atualizar a conversa.");
    } finally {
      setUpdatingConversation(false);
    }
  }

  const status = overview?.status;
  const connectionLabel = !status ? "Verificando configuração" : !status.configured ? "WhatsApp não conectado" : "Configuração disponível";
  const modeLabel = status?.mode === "live" ? "Respostas habilitadas" : status?.mode === "shadow" ? "Somente rascunhos" : "Envios desativados";

  return <section className={styles.panel} aria-label="LegisDot Comercial">
    <div className={styles.banner}>
      <div className={styles.bannerIdentity}>
        <span className={styles.avatar} aria-hidden="true">L<span>·</span></span>
        <div><span className={styles.eyebrow}>Seu atendimento, com contexto</span><h2>Da primeira dúvida ao material certo.</h2><p>Catálogo real, respostas em português e passagem para atendimento humano.</p></div>
      </div>
      <div className={styles.connectionState}>
        <span><StatusDot active={Boolean(status?.configured)} />{connectionLabel}</span>
        <small>{status ? modeLabel : "Carregando estado do servidor…"}</small>
        <button className={styles.textButton} type="button" onClick={() => setTab("connection")}>Ver conexão →</button>
      </div>
    </div>

    <div className={styles.toolbar}>
      <nav className={styles.tabs} aria-label="Áreas do atendimento">
        {([ ["simulator", "Simulador"], ["conversations", "Conversas"], ["connection", "Conexão"] ] as const).map(([value, label]) => <button
          key={value} type="button" aria-current={tab === value ? "page" : undefined}
          className={tab === value ? styles.currentTab : ""} onClick={() => { setTab(value); setNotice(""); }}
        >{label}</button>)}
      </nav>
      <button type="button" className={styles.secondaryButton} disabled={loading} onClick={() => void loadOverview()}>{loading ? "Atualizando…" : "Atualizar painel"}</button>
    </div>
    {loadError ? <div className={styles.error} role="alert">{loadError}</div> : null}

    {tab === "simulator" ? <div className={styles.simulatorGrid}>
      <section className={styles.chatCard} aria-label="Simulação de atendimento">
        <div className={styles.cardHeader}>
          <div><h3>Converse como um aluno</h3><p>Esta simulação não envia mensagens ao WhatsApp.</p></div>
          <button type="button" className={styles.textButton} disabled={simulating || turns.length === 0} onClick={() => { setTurns([]); setSimulationError(""); setMessage(""); }}>Nova conversa</button>
        </div>
        <div className={styles.chatTranscript} ref={transcript} role="log" aria-live="polite" aria-label="Mensagens simuladas">
          {turns.length === 0 ? <div className={styles.chatEmpty}>
            <div className={styles.emptyIcon} aria-hidden="true">✦</div>
            <h4>Como seu cliente começaria?</h4>
            <p>Pergunte por uma lei, um concurso ou pelo funcionamento dos materiais.</p>
            <div className={styles.quickMessages}>{quickMessages.map((text) => <button type="button" key={text} disabled={simulating} onClick={() => void simulate(text)}>{text}</button>)}</div>
          </div> : turns.map((turn, index) => <div key={index} className={`${styles.bubbleRow} ${turn.role === "user" ? styles.userRow : ""}`}>
            <div className={`${styles.bubble} ${turn.role === "user" ? styles.userBubble : styles.assistantBubble}`}>
              <span className={styles.speaker}>{turn.role === "user" ? "Aluno · simulação" : "LegisDot"}</span>
              <p>{turn.content}</p>
              {turn.role === "assistant" ? <div className={styles.bubbleMeta}>
                <span>{turn.engine === "ai" ? "Assistida por IA" : "Regras de atendimento"}</span>
                {turn.handoff ? <span>Atendimento humano</span> : turn.optOut ? <span>Contato interrompido</span> : turn.stage ? <span>{stageLabels[turn.stage] ?? turn.stage}</span> : null}
              </div> : null}
            </div>
          </div>)}
          {simulating ? <p className={styles.typing} role="status">LegisDot está preparando a resposta…</p> : null}
        </div>
        <form onSubmit={submit} className={styles.composer}>
          {simulationError ? <p className={styles.error} role="alert">{simulationError}</p> : null}
          <label htmlFor="legisdot-message" className={styles.inputLabel}>Mensagem do aluno</label>
          <textarea id="legisdot-message" value={message} onChange={(event) => setMessage(event.target.value)}
            placeholder="Ex.: Estou estudando para a PMAL. Que material vocês têm?" rows={3} maxLength={2000} disabled={simulating} />
          <div className={styles.composerActions}>
            <label className={styles.checkboxLabel}><input type="checkbox" checked={useAI && Boolean(status?.aiConfigured)} disabled={!status?.aiConfigured || simulating} onChange={(event) => setUseAI(event.target.checked)} />Usar IA{!status?.aiConfigured ? " · pendente de configuração" : ""}</label>
            <button className={styles.primaryButton} type="submit" disabled={simulating || !message.trim()}>{simulating ? "Preparando…" : "Testar resposta"}</button>
          </div>
        </form>
      </section>
      <aside className={styles.simulatorAside}>
        <section className={styles.infoCard}><span className={styles.eyebrow}>Fonte das respostas</span><h3>Seu catálogo</h3>
          <p className={styles.catalogNumber}>{overview ? overview.catalogCount : "—"}<span> produtos disponíveis para consulta</span></p>
          <p>Preços, links e situação dos materiais vêm dos registros comerciais do site.</p>
          <Link href="/admin/comercial" className={styles.textLink}>Abrir gestão comercial →</Link>
        </section>
        <section className={styles.infoCard}><h3>O que testar agora</h3><ol className={styles.checkSteps}>
          <li><strong>Descoberta</strong><span>Peça um material pelo nome da lei ou do concurso.</span></li>
          <li><strong>Experiência gratuita</strong><span>Pergunte como experimentar antes de comprar.</span></li>
          <li><strong>Compra</strong><span>Escolha um item e peça o link de pagamento.</span></li>
          <li><strong>Suporte</strong><span>Peça ajuda de uma pessoa e confira o encaminhamento.</span></li>
        </ol></section>
        <p className={styles.footnote}>O histórico desta simulação fica apenas nesta página. Recarregar encerra a conversa.</p>
      </aside>
    </div> : null}

    {tab === "conversations" ? <section className={styles.conversationsCard}>
      <div className={styles.cardHeader}><div><h3>Atendimentos recebidos</h3><p>Conversas reais recebidas pela integração do WhatsApp.</p></div><span className={styles.badge}>{overview ? `${overview.conversations.length} na lista` : "Carregando…"}</span></div>
      {!status?.databaseReady && !loading ? <div className={styles.notice}>O registro de conversas ainda precisa ser configurado. O simulador pode ser usado separadamente.</div> : null}
      {overview?.conversations.length ? <div className={styles.conversationsGrid}>
        <aside className={styles.conversationList} aria-label="Escolher conversa">{overview.conversations.map((conversation) => <button
          type="button" key={conversation.id} onClick={() => { setSelectedId(conversation.id); setNotice(""); }}
          className={selectedId === conversation.id ? styles.selectedConversation : ""} aria-pressed={selectedId === conversation.id}
        ><strong>{conversation.displayName || conversation.senderLabel}</strong><span>{conversation.senderLabel}</span>
          <small className={conversation.status === "human" ? styles.needsHuman : ""}>{conversationLabels[conversation.status]}</small>
          <time dateTime={conversation.lastInboundAt}>{formatDate(conversation.lastInboundAt)}</time>
        </button>)}</aside>
        <div className={styles.conversationDetail}>
          {selected ? <>
            <div className={styles.detailHeader}><div><h4>{selected.displayName || selected.senderLabel}</h4><p>{stageLabels[selected.stage] ?? selected.stage} · {conversationLabels[selected.status]}</p></div>
              {selected.status !== "opted_out" ? <button type="button" className={styles.secondaryButton} disabled={updatingConversation} onClick={() => void updateConversation(selected.status === "bot" ? "pause" : "resume")}>{updatingConversation ? "Salvando…" : selected.status === "bot" ? "Assumir atendimento" : "Retomar assistente"}</button> : null}
            </div>
            {selected.status === "human" ? <p className={styles.notice}>O assistente está pausado nesta conversa. Continue o atendimento pelo WhatsApp conectado.</p> : null}
            {selected.status === "opted_out" ? <p className={styles.notice}>Este contato pediu para interromper as mensagens. A retomada não está disponível neste painel.</p> : null}
            {notice ? <p className={styles.success} role="status">{notice}</p> : null}
            {messagesError ? <p className={styles.error} role="alert">{messagesError}</p> : null}
            {messagesLoading ? <p className={styles.footnote} role="status">Carregando histórico…</p> : messages.length ? <div className={styles.realMessages}>{messages.map((item) => <article key={item.id} className={styles.messagePair}>
              <time dateTime={item.createdAt}>{formatDate(item.createdAt)}</time>
              <div className={`${styles.bubble} ${styles.userBubble}`}><span className={styles.speaker}>Cliente</span><p>{item.inboundText}</p></div>
              {item.replyText ? <div className={`${styles.bubble} ${styles.assistantBubble}`}><span className={styles.speaker}>LegisDot</span><p>{item.replyText}</p></div> : null}
              <small>{stateLabels[item.state] ?? item.state}{item.deliveryStatus ? ` · ${stateLabels[item.deliveryStatus] ?? item.deliveryStatus}` : ""}</small>
            </article>)}</div> : <p className={styles.footnote}>Nenhuma mensagem disponível nesta conversa.</p>}
          </> : <div className={styles.chatEmpty}><h4>Selecione uma conversa</h4><p>Leia as mensagens e acompanhe os encaminhamentos.</p></div>}
        </div>
      </div> : <div className={styles.emptyConversations}><div className={styles.emptyIcon} aria-hidden="true">↗</div><h4>{loading ? "Buscando conversas…" : "As próximas conversas aparecerão aqui"}</h4><p>Depois de conectar o número, você acompanha os atendimentos e assume aqueles que precisam de você.</p><button type="button" className={styles.secondaryButton} onClick={() => setTab("connection")}>Ver configuração</button></div>}
    </section> : null}

    {tab === "connection" ? <div className={styles.connectionGrid}>
      <section className={styles.infoCard}><span className={styles.eyebrow}>Estado da integração</span><h3>{connectionLabel}</h3>
        <p>O painel mostra a configuração do servidor. O teste com um número autorizado confirma o funcionamento no WhatsApp.</p>
        <dl className={styles.configList}>
          <div><dt>Respostas</dt><dd>{status ? modeLabel : "Verificando…"}</dd></div>
          <div><dt>Registro de conversas</dt><dd>{status ? status.databaseReady ? "Disponível" : "Pendente" : "Verificando…"}</dd></div>
          <div><dt>Inteligência artificial</dt><dd>{status ? status.aiConfigured ? "Configurada" : "Regras de atendimento disponíveis" : "Verificando…"}</dd></div>
          <div><dt>Destinatários de teste</dt><dd>{status ? status.allowlistRequired ? "Lista de teste exigida" : "Conforme configuração do servidor" : "Verificando…"}</dd></div>
        </dl>
        {status?.missing.length ? <div className={styles.missing}><h4>Itens pendentes no servidor</h4><ul>{status.missing.map((item) => <li key={item}><code>{item}</code></li>)}</ul><p>Configure os valores no ambiente de hospedagem. Credenciais não são preenchidas nem exibidas neste painel.</p></div> : status ? <p className={styles.success}>Os campos exigidos estão configurados. Valide a entrega com um contato de teste antes de ampliar o atendimento.</p> : null}
      </section>
      <section className={styles.infoCard}><span className={styles.eyebrow}>Preparação</span><h3>Conectar, testar e acompanhar</h3>
        <ol className={styles.checkSteps}>
          <li><strong>Escolher o número</strong><span>Defina o número de atendimento e a forma de conexão na conta empresarial da Meta.</span></li>
          <li><strong>Preparar a integração</strong><span>Configure as credenciais no servidor, o registro de conversas e a assinatura do webhook.</span></li>
          <li><strong>Conferir as respostas</strong><span>Use o simulador e o modo de rascunhos para revisar materiais, preços e encaminhamentos.</span></li>
          <li><strong>Testar a entrega</strong><span>Habilite o envio para contatos de teste e confira o recebimento antes de ampliar o uso.</span></li>
        </ol>
        {status?.webhookPath ? <div className={styles.webhook}><strong>Caminho do webhook</strong><code>{status.webhookPath}</code><small>Use este caminho junto ao domínio do ambiente configurado.</small></div> : null}
        <p className={styles.footnote}>As compras continuam no checkout cadastrado. A confirmação de pagamento e a liberação seguem o fluxo existente do site.</p>
      </section>
    </div> : null}
  </section>;
}
