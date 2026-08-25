"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { limparApresentacao } from "@/lib/legisbot/clean-comment";
import LegisBotCommentContent from "@/components/legisbot-comment-content";
import LegisBotCommunity from "@/components/legisbot-community";
import { legalHtmlToPlainText } from "@/lib/legisbot-community";
import { supabase } from "@/lib/supabase";
import LegisBotStudyTabs, { type LegisBotStudyTab } from "@/components/legisbot-study-tabs";
import LegisBotPersonalHighlights from "@/components/legisbot-personal-highlights";
import {
  isHighlightCompatible,
  type LegisBotHighlight,
} from "@/lib/legisbot-highlights";

const fallback = { titulo: "Legislação não informada", assunto: "Artigo não informado" };
const SLUG_VALIDO = /^[A-Z0-9_-]{1,50}$/;
const ORDEM_VALIDA = /^[A-Za-z0-9._-]{1,20}$/;

type DadosLegislacao = { titulo: string; assunto: string; legislacao: string };
type AnswerState =
  | "loading"
  | "processing"
  | "generating"
  | "ready"
  | "not_found"
  | "invalid"
  | "timeout"
  | "quota"
  | "limited"
  | "error";

type LegisBotPageClientProps = {
  slug: string;
  ordem: string;
  dadosIniciais: DadosLegislacao;
  initialCommunityCount: number;
  initialTab?: LegisBotStudyTab;
  adminShortcut?: ReactNode;
  embedded?: boolean;
  onClose?: () => void;
};

type LegisBotApiResponse = {
  success: boolean;
  source?: "database" | "generated" | "processing";
  comment?: string | null;
  titulo?: string;
  assunto?: string;
  legislacao?: string;
  error?: string;
  reason?: "legisbot_resting" | "rate_limited" | "cooldown" | "attempts_exhausted";
};

type HighlightedLegalTextProps = {
  text: string;
  highlights: LegisBotHighlight[];
  onHighlightClick: (highlight: LegisBotHighlight) => void;
};

function HighlightedLegalText({
  text,
  highlights,
  onHighlightClick,
}: HighlightedLegalTextProps) {
  const compatibleHighlights = useMemo(
    () => highlights.filter((item) => isHighlightCompatible(item, text)).sort((a, b) => a.start - b.start),
    [highlights, text],
  );

  const parts = useMemo(() => {
    const result: ReactNode[] = [];
    let cursor = 0;
    for (const highlight of compatibleHighlights) {
      if (highlight.start > cursor) result.push(text.slice(cursor, highlight.start));
      result.push(
        <mark
          key={highlight.id}
          className={`personal-highlight ${highlight.color}`}
          data-highlight-id={highlight.id}
          title="Toque para editar este destaque"
          onClick={() => onHighlightClick(highlight)}
        >
          {text.slice(highlight.start, highlight.end)}
        </mark>,
      );
      cursor = highlight.end;
    }
    if (cursor < text.length) result.push(text.slice(cursor));
    return result;
  }, [compatibleHighlights, onHighlightClick, text]);

  return <p>{parts}</p>;
}

export default function LegisBotPageClient({
  slug,
  ordem,
  dadosIniciais,
  initialCommunityCount,
  initialTab = "legisbot",
  adminShortcut,
  embedded = false,
  onClose,
}: LegisBotPageClientProps) {
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const [dadosLegislacao, setDadosLegislacao] = useState(dadosIniciais);
  const [source, setSource] = useState<LegisBotApiResponse["source"]>();
  const [answer, setAnswer] = useState<string | null>(null);
  const [answerState, setAnswerState] = useState<AnswerState>("loading");
  const [authenticated, setAuthenticated] = useState<boolean | null>(null);
  const [statusMessage, setStatusMessage] = useState("");
  const [readRevision, setReadRevision] = useState(0);
  const [returnPath, setReturnPath] = useState(`/legisbot/${encodeURIComponent(slug)}/${encodeURIComponent(ordem)}`);
  const [communityCount, setCommunityCount] = useState(initialCommunityCount);
  const [activeStudyTab, setActiveStudyTab] = useState<LegisBotStudyTab>(initialTab);
  const [highlights, setHighlights] = useState<LegisBotHighlight[]>([]);
  const [selectedHighlight, setSelectedHighlight] = useState<LegisBotHighlight | null>(null);

  const titulo = dadosLegislacao.titulo || fallback.titulo;
  const assunto = dadosLegislacao.assunto || fallback.assunto;
  const textoLegal = legalHtmlToPlainText(dadosLegislacao.legislacao);
  const slugNormalizado = slug.trim().toUpperCase();
  const ordemNormalizada = ordem.trim();
  const identifiersValid = SLUG_VALIDO.test(slugNormalizado) && ORDEM_VALIDA.test(ordemNormalizada);
  const apiUrl = `/api/legisbot/${encodeURIComponent(slugNormalizado)}/${encodeURIComponent(ordemNormalizada)}`;
  const centralLegislacaoUrl = `/leis/${encodeURIComponent(slug.trim().toLowerCase())}`;
  const loginUrl = `/conta?retorno=${encodeURIComponent(returnPath)}`;
  const isCommentGenerationPending = answerState === "generating" || answerState === "processing";
  const questionPrompt = isCommentGenerationPending
    ? "🤖 LegisBot está preparando a explicação…"
    : "🤖 LegisBot, pode me explicar este artigo?";

  useEffect(() => {
    if (embedded) return;
    const saved = localStorage.getItem("legisbot-theme") === "dark" ? "dark" : "light";
    setTheme(saved);
    document.documentElement.dataset.legisbotTheme = saved;
    setReturnPath(`${window.location.pathname}${window.location.search}`);
  }, [embedded]);

  useEffect(() => {
    let active = true;
    void supabase.auth.getSession().then(({ data }) => {
      if (active) setAuthenticated(Boolean(data.session?.user));
    });
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      if (active) setAuthenticated(Boolean(session?.user));
    });
    return () => {
      active = false;
      data.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    let active = true;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;
    let retryAttempts = 0;
    const maxRetryAttempts = 12;

    async function carregarComentario() {
      if (!identifiersValid) {
        if (active) setAnswerState("invalid");
        return;
      }
      try {
        // GET é deliberadamente somente leitura: não envia dados de geração pela query string.
        const response = await fetch(apiUrl, { cache: "no-store" });
        const result = (await response.json()) as LegisBotApiResponse;
        if (!active) return;

        if (result.titulo && result.assunto && result.legislacao) {
          setDadosLegislacao({
            titulo: result.titulo,
            assunto: result.assunto,
            legislacao: result.legislacao,
          });
        }
        setSource(result.source);
        if (response.status === 202 || result.source === "processing") {
          retryAttempts += 1;
          if (retryAttempts >= maxRetryAttempts) {
            setAnswerState("timeout");
            return;
          }
          setAnswerState("processing");
          retryTimer = setTimeout(carregarComentario, 2500);
          return;
        }
        if (response.status === 404) {
          setAnswerState("not_found");
          return;
        }
        if (!response.ok || !result.success || !result.comment?.trim()) {
          setAnswerState("error");
          return;
        }
        setAnswer(limparApresentacao(result.comment));
        setAnswerState("ready");
      } catch {
        if (active) setAnswerState("error");
      }
    }

    void carregarComentario();
    return () => {
      active = false;
      if (retryTimer) clearTimeout(retryTimer);
    };
  }, [apiUrl, identifiersValid, readRevision]);

  async function gerarComentario() {
    if (!identifiersValid || answerState === "generating") return;
    setStatusMessage("");
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token) {
      setAuthenticated(false);
      return;
    }
    setAuthenticated(true);
    setAnswerState("generating");
    try {
      const response = await fetch(`${apiUrl}/generate`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(dadosIniciais),
      });
      const result = (await response.json()) as LegisBotApiResponse;
      if (response.status === 401) {
        setAuthenticated(false);
        setAnswerState("not_found");
        return;
      }
      if (response.status === 202 || result.source === "processing") {
        setAnswerState("processing");
        setReadRevision((value) => value + 1);
        return;
      }
      if (result.reason === "legisbot_resting") {
        setAnswerState("quota");
        return;
      }
      if (result.reason === "rate_limited" || result.reason === "cooldown" || result.reason === "attempts_exhausted") {
        setStatusMessage(result.error ?? "A geração não está disponível agora. Tente novamente mais tarde.");
        setAnswerState("limited");
        return;
      }
      if (!response.ok || !result.success || !result.comment?.trim()) {
        setStatusMessage(result.error ?? "Não foi possível iniciar a geração.");
        setAnswerState("error");
        return;
      }
      if (result.titulo && result.assunto && result.legislacao) {
        setDadosLegislacao({ titulo: result.titulo, assunto: result.assunto, legislacao: result.legislacao });
      }
      setSource(result.source);
      setAnswer(limparApresentacao(result.comment));
      setAnswerState("ready");
    } catch {
      setStatusMessage("Não foi possível iniciar a geração no momento.");
      setAnswerState("error");
    }
  }

  const updateCommunityCount = useCallback((count: number) => {
    setCommunityCount(Math.max(0, count));
  }, []);

  const updateHighlights = useCallback((items: LegisBotHighlight[]) => {
    setHighlights(items);
  }, []);

  const selectHighlight = useCallback((item: LegisBotHighlight) => {
    if (activeStudyTab !== "highlights") return;
    setSelectedHighlight(item);
  }, [activeStudyTab]);

  const changeStudyTab = useCallback((tab: LegisBotStudyTab) => {
    setActiveStudyTab(tab);
    if (tab !== "highlights") {
      setSelectedHighlight(null);
    }
  }, []);

  const legisBotContent = <>
    <section className="question-block" aria-label="Pergunta feita ao LegisBot">
      <span className="question-label">👤 Você perguntou:</span>
      {answerState === "not_found" && authenticated === false ? (
        <a className="question-card legisbot-question-action" href={loginUrl}>{questionPrompt}</a>
      ) : answerState === "not_found" || isCommentGenerationPending ? (
        <button
          className="question-card legisbot-question-action"
          type="button"
          onClick={() => void gerarComentario()}
          disabled={answerState !== "not_found" || authenticated !== true}
        >
          {questionPrompt}
        </button>
      ) : <div className="question-card">{questionPrompt}</div>}
    </section>

    <article className="bot-answer" aria-labelledby="legisbot-answer-title">
      <div className="answer-header"><div className="bot-avatar small" aria-hidden="true">🤖</div><div><h2 id="legisbot-answer-title">LegisBot</h2><p>Claro! Vamos lá:</p></div></div>
      <div className="answer-content answer-freeform" aria-live="polite">
        {answerState === "ready" && answer ? <LegisBotCommentContent html={answer} /> : null}
        {answerState === "loading" ? <p className="answer-status">Buscando a explicação…</p> : null}
        {answerState === "not_found" && authenticated === null ? <p className="answer-status">Verificando sua conta…</p> : null}
        {answerState === "invalid" ? <p className="answer-status answer-error">Os identificadores do trecho são inválidos.</p> : null}
        {answerState === "timeout" ? <p className="answer-status">A explicação ainda está sendo preparada. Tente novamente em alguns instantes.</p> : null}
        {answerState === "quota" ? <p className="answer-status answer-error">🤖 O LegisBot está descansando um pouco. Tente novamente mais tarde.</p> : null}
        {answerState === "limited" ? <p className="answer-status answer-error">{statusMessage}</p> : null}
        {answerState === "error" ? <p className="answer-status answer-error">{statusMessage || "Não foi possível carregar a explicação no momento. Tente novamente mais tarde."}</p> : null}
      </div>
    </article>

    <div className="legisbot-report"><a href="mailto:zlegisflashcards@gmail.com?subject=Reportar%20erro%20no%20LegisBot">⚑ Reportar erro</a></div>
    <footer className="legisbot-footer"><div className="ai-notice"><span aria-hidden="true">⚠️</span><p>Este conteúdo foi gerado com auxílio de inteligência artificial e pode conter imprecisões. Sempre confirme as informações com os professores da Legisflashcards.</p></div></footer>
  </>;

  return <div className={`legisbot-page${embedded ? " legisbot-embedded" : ""}`} data-theme={theme}>
    <main className="legisbot-main" data-source={source}>
      <header className="legisbot-topic-header" data-slug={slug} data-ordem={ordem}>
        {embedded ? <div className="legisbot-topic-tools"><button type="button" className="legislation-back-link legisbot-overlay-back" onClick={onClose}>← Voltar ao estudo</button><button type="button" className="legisbot-overlay-close" aria-label="Fechar LegisBot e voltar ao estudo" onClick={onClose}>×</button></div> : <div className="legisbot-topic-tools"><a href={centralLegislacaoUrl} className="legislation-back-link"><span aria-hidden="true">←</span> {titulo}</a>{adminShortcut}</div>}
        <h1>{assunto}</h1>
      </header>

      {textoLegal ? <section className="legisbot-legal-text" aria-labelledby="legal-text-title"><h2 id="legal-text-title">Texto legal</h2><HighlightedLegalText text={textoLegal} highlights={highlights} onHighlightClick={selectHighlight} /></section> : null}
      <LegisBotStudyTabs
        slug={slugNormalizado}
        ordem={ordemNormalizada}
        communityCount={communityCount}
        initialTab={initialTab}
        onActiveTabChange={changeStudyTab}
        legisBotContent={legisBotContent}
        communityContent={
          <LegisBotCommunity
            slug={slugNormalizado}
            ordem={ordemNormalizada}
            onContributionCountChange={updateCommunityCount}
          />
        }
        highlightsContent={
          <LegisBotPersonalHighlights
            slug={slugNormalizado}
            ordem={ordemNormalizada}
            legislationText={textoLegal}
            selectedHighlight={selectedHighlight}
            onHighlightsChange={updateHighlights}
            onSelectedHighlightClear={() => setSelectedHighlight(null)}
          />
        }
      />
    </main>
  </div>;
}
