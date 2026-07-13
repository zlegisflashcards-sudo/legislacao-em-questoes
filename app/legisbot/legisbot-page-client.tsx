"use client";

import { useEffect, useState } from "react";
import { limparApresentacao } from "@/lib/legisbot/clean-comment";

const fallback = { titulo: "Legislação não informada", assunto: "Artigo não informado", legislacao: "O texto da legislação aparecerá aqui." };
const SLUG_VALIDO = /^[A-Z0-9_-]{1,50}$/;
const ORDEM_VALIDA = /^[A-Za-z0-9._-]{1,20}$/;

type LegisBotPageClientProps = {
  slug: string;
  ordem: string;
  dadosIniciais: DadosLegislacao;
};

type DadosLegislacao = {
  titulo: string;
  assunto: string;
  legislacao: string;
};

type LegisBotApiResponse = {
  success: boolean;
  source?: "database" | "generated" | "processing";
  comment?: string | null;
  titulo?: string;
  assunto?: string;
  legislacao?: string;
};

export default function LegisBotPageClient({
  slug,
  ordem,
  dadosIniciais,
}: LegisBotPageClientProps) {
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const [dadosLegislacao, setDadosLegislacao] = useState(dadosIniciais);
  const [source, setSource] = useState<LegisBotApiResponse["source"]>();
  const titulo = dadosLegislacao.titulo || fallback.titulo;
  const assunto = dadosLegislacao.assunto || fallback.assunto;
  const legislacao = dadosLegislacao.legislacao || fallback.legislacao;
  const [answer, setAnswer] = useState<string | null>(null);
  const [answerState, setAnswerState] = useState<
    "loading" | "processing" | "ready" | "not_found" | "invalid" | "timeout" | "error"
  >("loading");

  useEffect(() => {
    const saved = localStorage.getItem("legisbot-theme") === "dark" ? "dark" : "light";
    setTheme(saved); document.documentElement.dataset.legisbotTheme = saved;
  }, []);

  useEffect(() => {
    let active = true;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;
    let retryAttempts = 0;
    const maxRetryAttempts = 12;

    async function carregarComentario() {
      const slugNormalizado = slug.trim().toUpperCase();
      const ordemNormalizada = ordem.trim();

      if (!SLUG_VALIDO.test(slugNormalizado) || !ORDEM_VALIDA.test(ordemNormalizada)) {
        if (active) setAnswerState("invalid");
        return;
      }

      try {
        const query = new URLSearchParams();
        if (dadosIniciais.titulo) query.set("titulo", dadosIniciais.titulo);
        if (dadosIniciais.assunto) query.set("assunto", dadosIniciais.assunto);
        if (dadosIniciais.legislacao) query.set("legislacao", dadosIniciais.legislacao);
        const sufixoQuery = query.size > 0 ? `?${query.toString()}` : "";
        const response = await fetch(
          `/api/legisbot/${encodeURIComponent(slugNormalizado)}/${encodeURIComponent(ordemNormalizada)}${sufixoQuery}`,
          { cache: "no-store" },
        );
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
  }, [slug, ordem, dadosIniciais.titulo, dadosIniciais.assunto, dadosIniciais.legislacao]);
  function toggleTheme() {
    const next = theme === "light" ? "dark" : "light";
    setTheme(next); localStorage.setItem("legisbot-theme", next); document.documentElement.dataset.legisbotTheme = next;
  }

  return <div className="legisbot-page" data-theme={theme}>
    <header className="legisbot-header"><div className="legisbot-header-inner">
      <button type="button" onClick={() => history.back()} className="icon-button" aria-label="Voltar" title="Voltar"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m15 18-6-6 6-6" /></svg></button>
      <div className="bot-avatar" aria-hidden="true">🤖</div><div className="bot-identity"><strong>LegisBot</strong><span>Seu assistente de legislação</span></div>
      <button type="button" onClick={toggleTheme} className="icon-button theme-button" aria-label={theme === "light" ? "Ativar modo escuro" : "Ativar modo claro"}>{theme === "light" ? "☾" : "☀"}</button>
    </div></header>
    <main className="legisbot-main" data-source={source}>
      <section className="law-card" aria-labelledby="law-title" data-slug={slug} data-ordem={ordem}>
        <div className="law-heading"><div className="law-title-wrap"><span className="document-icon" aria-hidden="true">▤</span><div><h1 id="law-title">{assunto}</h1></div></div><span className="order-label">{titulo}</span></div>
        <div
          className="law-text"
          data-sanitized="true"
          dangerouslySetInnerHTML={{ __html: legislacao }}
        />
      </section>
      <section className="conversation" aria-label="Conversa com o LegisBot">
        <div className="student-message"><div className="student-avatar" aria-hidden="true">👤</div><div><span>Você perguntou:</span><p>🤖 LegisBot, pode me explicar este artigo?</p></div></div>
        <article className="bot-answer"><div className="answer-header"><div className="bot-avatar small" aria-hidden="true">🤖</div><div><h2>LegisBot</h2><p>Claro! Vamos lá:</p></div></div>
          <div className="answer-content answer-freeform" aria-live="polite">
            {answerState === "ready" && answer ? <p>{answer}</p> : null}
            {answerState === "loading" ? <p className="answer-status">Buscando a explicação…</p> : null}
            {answerState === "processing" ? <p className="answer-status">Estou preparando a explicação deste artigo…</p> : null}
            {answerState === "not_found" ? <p className="answer-status answer-error">Trecho não encontrado.</p> : null}
            {answerState === "invalid" ? <p className="answer-status answer-error">Os identificadores do trecho são inválidos.</p> : null}
            {answerState === "timeout" ? <p className="answer-status">A explicação ainda está sendo preparada. Tente novamente em alguns instantes.</p> : null}
            {answerState === "error" ? <p className="answer-status answer-error">Não foi possível carregar a explicação no momento. Tente novamente mais tarde.</p> : null}
          </div>
        </article>
        <aside className="ai-notice"><span aria-hidden="true">⚠️</span><p>Este comentário foi elaborado com auxílio de inteligência artificial para apoiar seus estudos e pode conter imprecisões. Em caso de dúvidas, consulte a equipe da LegisFlashcards em <a href="https://www.legisflashcards.com.br" target="_blank" rel="noreferrer">www.legisflashcards.com.br</a>.</p></aside>
        <aside className="legiscast-card"><div className="legiscast-intro"><span className="podcast-icon" aria-hidden="true">🎙️</span><div><h2>Quer aprofundar este tema?</h2><p>O Legiscast explica este artigo com mais contexto, exemplos e fundamentos jurídicos.</p></div></div><div className="focus-note"><span aria-hidden="true">💡</span><p><strong>Atenção:</strong> se o seu objetivo é concurso, priorize primeiro as revisões e as questões no Anki. Use o Legiscast para aprofundar apenas quando sentir necessidade ou tiver dúvidas sobre o conteúdo.</p></div><a href="#" className="legiscast-button" onClick={(e) => e.preventDefault()}>▶️ <span>Ouvir episódio do Legiscast</span></a></aside>
      </section>
    </main>
  </div>;
}
