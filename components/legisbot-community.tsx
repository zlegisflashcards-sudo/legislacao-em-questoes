"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { supabase } from "@/lib/supabase";
import {
  COMMUNITY_MAX_LENGTH,
  COMMUNITY_QUOTE_MAX_LENGTH,
  validateCommunityContent,
  type CommunityComment,
  type CommunitySort,
} from "@/lib/legisbot-community";

type CommunityResponse = {
  success: boolean;
  message?: string;
  comments?: CommunityComment[];
  total?: number;
  contributionTotal?: number;
  page?: number;
  hasMore?: boolean;
  legislationText?: string;
  authenticated?: boolean;
  canPublishOfficial?: boolean;
};

type QuoteSelection = { text: string; start: number; end: number };
type Props = {
  slug: string;
  ordem: string;
  onContributionCountChange?: (count: number) => void;
};

const REPORT_REASONS = [
  ["incorreto", "Informação incorreta"],
  ["ofensivo", "Conteúdo ofensivo"],
  ["spam", "Spam"],
  ["fora_do_tema", "Sem relação com o artigo"],
  ["outro", "Outro"],
] as const;

function relativeDate(value: string) {
  const elapsed = Date.parse(value) - Date.now();
  const formatter = new Intl.RelativeTimeFormat("pt-BR", { numeric: "auto" });
  const minutes = Math.round(elapsed / 60_000);
  if (Math.abs(minutes) < 60) return formatter.format(minutes, "minute");
  const hours = Math.round(minutes / 60);
  if (Math.abs(hours) < 24) return formatter.format(hours, "hour");
  const days = Math.round(hours / 24);
  if (Math.abs(days) < 30) return formatter.format(days, "day");
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "medium" }).format(new Date(value));
}

async function authHeaders(json = false): Promise<HeadersInit> {
  const { data } = await supabase.auth.getSession();
  const headers: Record<string, string> = {};
  if (json) headers["Content-Type"] = "application/json";
  if (data.session?.access_token) headers.Authorization = `Bearer ${data.session.access_token}`;
  return headers;
}

export default function LegisBotCommunity({
  slug,
  ordem,
  onContributionCountChange,
}: Props) {
  const [comments, setComments] = useState<CommunityComment[]>([]);
  const [sort, setSort] = useState<CommunitySort>("relevant");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [authenticated, setAuthenticated] = useState(false);
  const [canPublishOfficial, setCanPublishOfficial] = useState(false);
  const [publishAsTeam, setPublishAsTeam] = useState(false);
  const [legislationText, setLegislationText] = useState("");
  const [content, setContent] = useState("");
  const [quote, setQuote] = useState<QuoteSelection | null>(null);
  const [replyTo, setReplyTo] = useState<CommunityComment | null>(null);
  const [editing, setEditing] = useState<CommunityComment | null>(null);
  const [editContent, setEditContent] = useState("");
  const [reporting, setReporting] = useState<CommunityComment | null>(null);
  const [reportReason, setReportReason] = useState("incorreto");
  const [quoteOpen, setQuoteOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState("");
  const quoteArea = useRef<HTMLTextAreaElement>(null);
  const editor = useRef<HTMLTextAreaElement>(null);
  const returnPath = `/legisbot/${encodeURIComponent(slug)}/${encodeURIComponent(ordem)}`;

  const load = useCallback(async (requestedPage = 1, append = false) => {
    setLoading(true);
    try {
      const response = await fetch(
        `/api/legisbot/${encodeURIComponent(slug)}/${encodeURIComponent(ordem)}/comunidade?sort=${sort}&page=${requestedPage}`,
        { cache: "no-store", headers: await authHeaders() },
      );
      const result = await response.json() as CommunityResponse;
      if (!response.ok || !result.success) throw new Error(result.message);
      setComments((current) => append ? [...current, ...(result.comments ?? [])] : result.comments ?? []);
      setPage(requestedPage);
      setTotal(result.total ?? 0);
      onContributionCountChange?.(result.contributionTotal ?? 0);
      setHasMore(Boolean(result.hasMore));
      setAuthenticated(Boolean(result.authenticated));
      setCanPublishOfficial(Boolean(result.canPublishOfficial));
      setLegislationText(result.legislationText ?? "");
    } catch {
      setMessage("Não foi possível carregar os comentários da comunidade.");
    } finally {
      setLoading(false);
    }
  }, [onContributionCountChange, ordem, slug, sort]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange(() => { void load(); });
    return () => data.subscription.unsubscribe();
  }, [load]);

  const visibleCount = useMemo(
    () => comments.reduce((count, item) => count + 1 + item.replies.length, 0),
    [comments],
  );

  function insertMarkup(before: string, after = before) {
    const textarea = editor.current;
    if (!textarea) return;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selected = content.slice(start, end) || "texto";
    const next = `${content.slice(0, start)}${before}${selected}${after}${content.slice(end)}`;
    setContent(next.slice(0, COMMUNITY_MAX_LENGTH));
    requestAnimationFrame(() => {
      textarea.focus();
      textarea.setSelectionRange(start + before.length, start + before.length + selected.length);
    });
  }

  function confirmQuote() {
    const textarea = quoteArea.current;
    if (!textarea) return;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const text = legislationText.slice(start, end);
    if (!text.trim()) { setMessage("Selecione um trecho da legislação."); return; }
    if (text.length > COMMUNITY_QUOTE_MAX_LENGTH) { setMessage("O destaque pode ter no máximo 1.000 caracteres."); return; }
    setQuote({ text, start, end });
    setQuoteOpen(false);
    setMessage("");
    requestAnimationFrame(() => editor.current?.focus());
  }

  async function publish() {
    const validation = validateCommunityContent(content);
    if (!validation.ok) { setMessage(validation.message); return; }
    setSubmitting(true); setMessage("");
    try {
      const response = await fetch(
        `/api/legisbot/${encodeURIComponent(slug)}/${encodeURIComponent(ordem)}/comunidade`,
        {
          method: "POST",
          headers: await authHeaders(true),
          body: JSON.stringify({
            content: validation.content,
            parentId: replyTo?.id ?? null,
            quotedText: quote?.text ?? null,
            quoteStart: quote?.start ?? null,
            quoteEnd: quote?.end ?? null,
            publishAsTeam,
          }),
        },
      );
      const result = await response.json() as CommunityResponse;
      if (!response.ok) { setMessage(result.message ?? "Não foi possível publicar."); return; }
      setContent(""); setQuote(null); setReplyTo(null); setPublishAsTeam(false); setMessage("Comentário publicado.");
      await load(1);
    } finally {
      setSubmitting(false);
    }
  }

  async function mutateComment(comment: CommunityComment, method: "PATCH" | "DELETE", body?: object) {
    setSubmitting(true); setMessage("");
    try {
      const response = await fetch(`/api/legisbot/comunidade/${comment.id}`, {
        method,
        headers: await authHeaders(Boolean(body)),
        body: body ? JSON.stringify(body) : undefined,
      });
      const result = await response.json() as CommunityResponse;
      if (!response.ok) { setMessage(result.message ?? "Não foi possível concluir a operação."); return; }
      setEditing(null); setMessage(result.message ?? "Alteração concluída."); await load(1);
    } finally { setSubmitting(false); }
  }

  async function toggleLike(comment: CommunityComment) {
    if (!authenticated || comment.isOwn) return;
    const response = await fetch(`/api/legisbot/comunidade/${comment.id}/curtida`, {
      method: comment.likedByMe ? "DELETE" : "POST",
      headers: await authHeaders(),
    });
    const result = await response.json() as CommunityResponse;
    if (!response.ok) { setMessage(result.message ?? "Não foi possível atualizar a curtida."); return; }
    const update = (item: CommunityComment): CommunityComment => item.id === comment.id
      ? { ...item, likedByMe: !item.likedByMe, likeCount: item.likeCount + (item.likedByMe ? -1 : 1) }
      : { ...item, replies: item.replies.map(update) };
    setComments((current) => current.map(update));
  }

  async function submitReport() {
    if (!reporting) return;
    setSubmitting(true);
    try {
      const response = await fetch(`/api/legisbot/comunidade/${reporting.id}/denuncia`, {
        method: "POST", headers: await authHeaders(true), body: JSON.stringify({ motivo: reportReason }),
      });
      const result = await response.json() as CommunityResponse;
      setMessage(result.message ?? (response.ok ? "Denúncia registrada." : "Não foi possível denunciar."));
      if (response.ok) setReporting(null);
    } finally { setSubmitting(false); }
  }

  function beginReply(comment: CommunityComment) {
    if (!authenticated) return;
    setReplyTo(comment); setEditing(null);
    requestAnimationFrame(() => editor.current?.focus());
  }

  function CommentCard({ comment, reply = false }: { comment: CommunityComment; reply?: boolean }) {
    const isEditing = editing?.id === comment.id;
    return <article className={`community-comment ${reply ? "community-reply" : ""} ${comment.official ? "community-official" : ""}`}>
      <header className="community-comment-header">
        <strong>{comment.publicName}</strong><span>·</span>
        <time dateTime={comment.createdAt} title={new Date(comment.createdAt).toLocaleString("pt-BR")}>{relativeDate(comment.createdAt)}</time>
        {comment.edited ? <span>· Editado</span> : null}
      </header>
      {comment.replyingToName ? <p className="community-replying">Respondendo a <strong>{comment.replyingToName}</strong></p> : null}
      {comment.status === "removido" ? <p className="community-removed">Comentário removido pelo autor.</p> : <>
        {comment.quotedText ? <blockquote className="community-quote"><span>Trecho destacado da legislação</span><mark>{comment.quotedText}</mark></blockquote> : null}
        {isEditing ? <div className="community-inline-editor"><textarea value={editContent} onChange={(event) => setEditContent(event.target.value)} maxLength={COMMUNITY_MAX_LENGTH} rows={4} /><div><button type="button" disabled={submitting} onClick={() => void mutateComment(comment, "PATCH", { content: editContent })}>Salvar</button><button type="button" onClick={() => setEditing(null)}>Cancelar</button></div></div>
          : <div className="community-markdown"><ReactMarkdown remarkPlugins={[remarkGfm]} skipHtml unwrapDisallowed allowedElements={["p", "strong", "em", "ul", "ol", "li", "blockquote", "br"]}>{comment.content ?? ""}</ReactMarkdown></div>}
      </>}
      {comment.status === "publicado" && !isEditing ? <footer className="community-actions">
        <button type="button" disabled={!authenticated || comment.isOwn} aria-pressed={comment.likedByMe} onClick={() => void toggleLike(comment)}>{comment.likedByMe ? "♥" : "♡"} {comment.likeCount} {comment.likeCount === 1 ? "curtida" : "curtidas"}</button>
        <button type="button" disabled={!authenticated} onClick={() => beginReply(comment)}>Responder</button>
        {comment.isOwn ? <><button type="button" onClick={() => { setEditing(comment); setEditContent(comment.content ?? ""); }}>Editar</button><button type="button" disabled={submitting} onClick={() => window.confirm("Remover este comentário?") && void mutateComment(comment, "DELETE")}>Excluir</button></> : null}
        {!comment.isOwn ? <button type="button" disabled={!authenticated} onClick={() => setReporting(comment)}>Denunciar</button> : null}
      </footer> : null}
    </article>;
  }

  return <section className="community-section" aria-labelledby="community-title">
    <header className="community-title-row">
      <div><p className="community-eyebrow">Discussão do artigo</p><h2 id="community-title">Comentários da comunidade</h2><p>Compartilhe sua interpretação, dúvida ou forma de memorizar este artigo.</p></div>
      <label>Ordenar<select value={sort} onChange={(event) => { setSort(event.target.value as CommunitySort); setPage(1); }}><option value="relevant">Mais relevantes</option><option value="recent">Mais recentes</option><option value="oldest">Mais antigos</option></select></label>
    </header>

    {authenticated ? <div className="community-editor">
      {replyTo ? <div className="community-context"><span>Respondendo a <strong>{replyTo.publicName}</strong></span><button type="button" onClick={() => setReplyTo(null)}>Cancelar resposta</button></div> : null}
      {quote ? <blockquote className="community-quote selected"><span>Trecho citado da legislação</span><mark>{quote.text}</mark><button type="button" onClick={() => setQuote(null)}>Remover citação</button></blockquote> : null}
      <div className="community-toolbar" aria-label="Formatação do comentário"><button type="button" onClick={() => insertMarkup("**")}>Negrito</button><button type="button" onClick={() => insertMarkup("*")}>Itálico</button><button type="button" onClick={() => insertMarkup("> ", "")}>Citação</button><button type="button" onClick={() => insertMarkup("- ", "")}>Lista</button><button type="button" onClick={() => setQuoteOpen(true)}>💬 Citar trecho</button></div>
      {canPublishOfficial ? <fieldset className="community-identity"><legend>Publicar como</legend><label><input type="radio" name="community_identity" checked={!publishAsTeam} onChange={() => setPublishAsTeam(false)} /> Perfil pessoal</label><label><input type="radio" name="community_identity" checked={publishAsTeam} onChange={() => setPublishAsTeam(true)} /> Legis Flashcards ✓</label></fieldset> : null}
      <textarea ref={editor} value={content} onChange={(event) => setContent(event.target.value)} maxLength={COMMUNITY_MAX_LENGTH} rows={5} placeholder="Escreva sua contribuição para a discussão…" />
      <div className="community-editor-footer"><span>{content.length}/{COMMUNITY_MAX_LENGTH}</span><button type="button" disabled={submitting} onClick={() => void publish()}>{submitting ? "Publicando…" : "Publicar comentário"}</button></div>
    </div> : <div className="community-login-callout"><p>Entre na sua conta para participar da discussão.</p><div><Link href={`/conta?modo=login&retorno=${encodeURIComponent(returnPath)}`}>Entrar</Link><Link href={`/conta?modo=cadastro&retorno=${encodeURIComponent(returnPath)}`}>Criar conta</Link></div></div>}

    {message ? <p className="community-message" role="status">{message}</p> : null}
    <p className="community-count">{total} {total === 1 ? "comentário principal" : "comentários principais"}</p>
    {loading && !comments.length ? <p className="community-loading">Carregando comentários…</p> : null}
    {!loading && !comments.length ? <p className="community-empty">Ainda não há comentários. Seja a primeira pessoa a contribuir.</p> : null}
    <div className="community-list">{comments.map((comment) => <div key={comment.id} className="community-thread"><CommentCard comment={comment} />{comment.replies.map((reply) => <CommentCard key={reply.id} comment={reply} reply />)}</div>)}</div>
    {hasMore ? <button className="community-load-more" type="button" disabled={loading} onClick={() => void load(page + 1, true)}>{loading ? "Carregando…" : "Carregar mais comentários"}</button> : null}
    {visibleCount > 0 && !hasMore ? <p className="community-end">Você chegou ao fim da discussão.</p> : null}

    {quoteOpen ? <div className="community-modal-backdrop" role="presentation"><div className="community-modal" role="dialog" aria-modal="true" aria-labelledby="quote-dialog-title"><h3 id="quote-dialog-title">Citar trecho da legislação</h3><p>Selecione somente o trecho relevante. O texto citado será conferido com a legislação original antes da publicação.</p><textarea ref={quoteArea} readOnly value={legislationText} rows={12} /><div className="community-modal-actions"><button type="button" onClick={() => setQuoteOpen(false)}>Cancelar</button><button type="button" onClick={confirmQuote}>Citar trecho selecionado</button></div></div></div> : null}
    {reporting ? <div className="community-modal-backdrop" role="presentation"><div className="community-modal small" role="dialog" aria-modal="true" aria-labelledby="report-dialog-title"><h3 id="report-dialog-title">Denunciar comentário</h3><label>Motivo<select value={reportReason} onChange={(event) => setReportReason(event.target.value)}>{REPORT_REASONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><div className="community-modal-actions"><button type="button" onClick={() => setReporting(null)}>Cancelar</button><button type="button" disabled={submitting} onClick={() => void submitReport()}>Enviar denúncia</button></div></div></div> : null}
  </section>;
}
