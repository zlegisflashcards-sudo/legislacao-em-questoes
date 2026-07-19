"use client";

import { useEffect, useState, type ReactNode } from "react";
import { limparApresentacao } from "@/lib/legisbot/clean-comment";
import LegisBotCommentContent from "@/components/legisbot-comment-content";

const fallback = { titulo: "Legislação não informada", assunto: "Artigo não informado" };
const SLUG_VALIDO = /^[A-Z0-9_-]{1,50}$/;
const ORDEM_VALIDA = /^[A-Za-z0-9._-]{1,20}$/;

type LegisBotPageClientProps = {
  slug: string;
  ordem: string;
  dadosIniciais: DadosLegislacao;
  adminShortcut?: ReactNode;
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
  adminShortcut,
}: LegisBotPageClientProps) {
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const [dadosLegislacao, setDadosLegislacao] = useState(dadosIniciais);
  const [source, setSource] = useState<LegisBotApiResponse["source"]>();
  const titulo = dadosLegislacao.titulo || fallback.titulo;
  const assunto = dadosLegislacao.assunto || fallback.assunto;
  const centralLegislacaoUrl = `/leis/${encodeURIComponent(
    slug.trim().toLowerCase(),
  )}`;
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
  return <div className="legisbot-page" data-theme={theme}>
    <main className="legisbot-main" data-source={source}>
      <header className="legisbot-topic-header" data-slug={slug} data-ordem={ordem}>
        <div className="legisbot-topic-tools">
          <a href={centralLegislacaoUrl} className="legislation-back-link">
            <span aria-hidden="true">←</span> {titulo}
          </a>
          {adminShortcut}
        </div>
        <h1>{assunto}</h1>
      </header>

      <section className="question-block" aria-label="Pergunta feita ao LegisBot">
        <span className="question-label">👤 Você perguntou:</span>
        <div className="question-card">🤖 LegisBot, pode me explicar este artigo?</div>
      </section>

      <article className="bot-answer" aria-labelledby="legisbot-answer-title">
        <div className="answer-header"><div className="bot-avatar small" aria-hidden="true">🤖</div><div><h2 id="legisbot-answer-title">LegisBot</h2><p>Claro! Vamos lá:</p></div></div>
        <div className="answer-content answer-freeform" aria-live="polite">
          {answerState === "ready" && answer ? <LegisBotCommentContent html={answer} /> : null}
          {answerState === "loading" ? <p className="answer-status">Buscando a explicação…</p> : null}
          {answerState === "processing" ? <p className="answer-status">Estou preparando a explicação deste artigo…</p> : null}
          {answerState === "not_found" ? <p className="answer-status answer-error">Trecho não encontrado.</p> : null}
          {answerState === "invalid" ? <p className="answer-status answer-error">Os identificadores do trecho são inválidos.</p> : null}
          {answerState === "timeout" ? <p className="answer-status">A explicação ainda está sendo preparada. Tente novamente em alguns instantes.</p> : null}
          {answerState === "error" ? <p className="answer-status answer-error">Não foi possível carregar a explicação no momento. Tente novamente mais tarde.</p> : null}
        </div>
      </article>

      <div className="legisbot-report"><a href="mailto:zlegisflashcards@gmail.com?subject=Reportar%20erro%20no%20LegisBot">⚑ Reportar erro</a></div>

      <footer className="legisbot-footer"><div className="ai-notice"><span aria-hidden="true">⚠️</span><p>Este conteúdo foi gerado com auxílio de inteligência artificial e pode conter imprecisões. Sempre confirme as informações com os professores da Legisflashcards.</p></div></footer>
    </main>
  </div>;
}
