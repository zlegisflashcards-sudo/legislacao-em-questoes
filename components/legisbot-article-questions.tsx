"use client";

import { useEffect, useMemo, useState } from "react";
import { sanitizeLegisQuestoesHtml } from "@/lib/legis-questoes-html";
import { supabase } from "@/lib/supabase";

type Choice = "certo" | "errado";

type ArticleQuestion = {
  id: string;
  pergunta: string;
  resposta: string;
  justificativa: string | null;
};

function normalizedAnswer(value: string): Choice | null {
  const normalized = value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase();
  return ["certo", "certa", "correto", "correta"].includes(normalized)
    ? "certo"
    : ["errado", "errada", "incorreto", "incorreta"].includes(normalized)
      ? "errado"
      : null;
}

function SafeHtml({ value }: { value: string }) {
  const html = useMemo(() => sanitizeLegisQuestoesHtml(value), [value]);
  return <div className="legis-questoes-html" dangerouslySetInnerHTML={{ __html: html }} />;
}

export function LegisBotArticleQuestions({ slug, ordem, recorteId }: { slug: string; ordem: string; recorteId?: string | null }) {
  const [questions, setQuestions] = useState<ArticleQuestion[]>([]);
  const [index, setIndex] = useState(0);
  const [choice, setChoice] = useState<Choice | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const { data } = await supabase.auth.getSession();
        const token = data.session?.access_token;
        if (!token) throw new Error("Entre na sua conta para acessar as questões deste artigo.");
        const query = new URLSearchParams({ ordem });
        if (recorteId) query.set("recorte_id", recorteId);
        const response = await fetch(`/api/questoes/${encodeURIComponent(slug.toLowerCase())}/estudar?${query}`, {
          headers: { Authorization: `Bearer ${token}` },
          cache: "no-store",
        });
        const result = await response.json().catch(() => ({}));
        if (!response.ok || !Array.isArray(result.questions)) {
          throw new Error(result.message || "Não foi possível carregar as questões deste artigo.");
        }
        if (active) {
          setQuestions(result.questions);
          setIndex(0);
          setChoice(null);
        }
      } catch (caught) {
        if (active) setError(caught instanceof Error ? caught.message : "Não foi possível carregar as questões deste artigo.");
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, [ordem, recorteId, slug]);

  if (loading) return <p className="legisbot-questions-state" role="status">Carregando questões deste artigo…</p>;
  if (error) return <p className="legisbot-questions-state is-error" role="alert">{error}</p>;
  if (!questions.length) return <p className="legisbot-questions-state">Ainda não há questões disponíveis para este artigo.</p>;

  const question = questions[index];
  const answer = normalizedAnswer(question.resposta);
  const correct = choice !== null && choice === answer;

  function move(offset: number) {
    setIndex((current) => Math.min(questions.length - 1, Math.max(0, current + offset)));
    setChoice(null);
  }

  return <section className="legisbot-article-questions" aria-labelledby="legisbot-questions-title">
    <header>
      <div><p>QUESTÕES DESTE ARTIGO</p><h2 id="legisbot-questions-title">Pratique sem sair do Trecho de estudo</h2></div>
      <span>{index + 1} de {questions.length}</span>
    </header>
    <article className="legisbot-question-practice">
      <SafeHtml value={question.pergunta} />
      <div className="legisbot-question-choices" aria-label="Escolha uma resposta">
        <button type="button" className={choice === "certo" ? "selected" : ""} disabled={choice !== null} onClick={() => setChoice("certo")}>Certo</button>
        <button type="button" className={choice === "errado" ? "selected" : ""} disabled={choice !== null} onClick={() => setChoice("errado")}>Errado</button>
      </div>
      {choice ? <section className={`legisbot-question-feedback ${correct ? "is-correct" : "is-wrong"}`} aria-live="polite">
        <strong>{correct ? "✓ Você acertou." : "× Você errou."}</strong>
        <p>Gabarito: <b>{answer === "certo" ? "Certo" : "Errado"}</b></p>
        {question.justificativa ? <SafeHtml value={question.justificativa} /> : null}
      </section> : null}
    </article>
    <footer>
      <button type="button" disabled={index === 0} onClick={() => move(-1)}>← Anterior</button>
      <button type="button" disabled={index === questions.length - 1} onClick={() => move(1)}>Próxima →</button>
    </footer>
  </section>;
}
