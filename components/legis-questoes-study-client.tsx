"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase";

type StudyQuestion = { id: string; pergunta: string; resposta: string; justificativa: string | null; assunto: string | null; legislacao: string | null; ordem: number; titulo: string | null; capitulo: string | null; secao: string | null; subsecao: string | null; artigo: string | null };
type StudyLaw = { id: number; slug: string; titulo: string; nome_curto: string | null };
type StudyResponse = { success?: boolean; law?: StudyLaw; questions?: StudyQuestion[]; total?: number; message?: string };
type AnswerChoice = "certo" | "errado";

function PlayerState({ children }: { children: React.ReactNode }) {
  return <main className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6">{children}</main>;
}

export function LegisQuestoesStudyClient({ slug }: { slug: string }) {
  const searchParams = useSearchParams();
  const [law, setLaw] = useState<StudyLaw | null>(null);
  const [questions, setQuestions] = useState<StudyQuestion[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [selectedAnswer, setSelectedAnswer] = useState<AnswerChoice | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const queryString = searchParams.toString();

  useEffect(() => {
    let active = true;
    setLoading(true); setError(""); setLaw(null); setQuestions([]); setCurrentIndex(0); setSelectedAnswer(null);
    async function load() {
      try {
        const { data } = await supabase.auth.getSession();
        const token = data.session?.access_token;
        if (!token) {
          const retorno = encodeURIComponent(`/questoes/${slug}/estudar${queryString ? `?${queryString}` : ""}`);
          window.location.replace(`/conta?modo=login&retorno=${retorno}`);
          return;
        }
        const endpoint = `/api/questoes/${encodeURIComponent(slug)}/estudar${queryString ? `?${queryString}` : ""}`;
        const response = await fetch(endpoint, { cache: "no-store", headers: { Authorization: `Bearer ${token}` } });
        const result = await response.json().catch(() => ({})) as StudyResponse;
        if (!response.ok || !result.law || !Array.isArray(result.questions)) throw new Error(result.message || "Não foi possível carregar as questões.");
        if (!active) return;
        setLaw(result.law); setQuestions(result.questions);
      } catch (loadError) {
        if (active) setError(loadError instanceof Error ? loadError.message : "Não foi possível carregar as questões.");
      } finally {
        if (active) setLoading(false);
      }
    }
    void load();
    return () => { active = false; };
  }, [slug, queryString]);

  const currentQuestion = questions[currentIndex] ?? null;
  const progress = useMemo(() => questions.length ? Math.round(((currentIndex + 1) / questions.length) * 100) : 0, [currentIndex, questions.length]);
  const answered = selectedAnswer !== null;
  const correctAnswer = normalizeAnswer(currentQuestion?.resposta ?? "");
  const userWasCorrect = answered && correctAnswer !== null && selectedAnswer === correctAnswer;
  function answer(value: AnswerChoice) { if (!answered) setSelectedAnswer(value); }
  function nextQuestion() { if (currentIndex >= questions.length - 1) return; setCurrentIndex((index) => index + 1); setSelectedAnswer(null); window.scrollTo({ top: 0, behavior: "smooth" }); }

  if (loading) return <PlayerState><div className="rounded-2xl border border-blue-100 bg-white p-8 text-slate-600 shadow-sm">Carregando questões...</div></PlayerState>;
  if (error) return <PlayerState><div role="alert" className="rounded-2xl border border-red-200 bg-white p-8 text-red-700 shadow-sm"><p>{error}</p><BackToDecks /></div></PlayerState>;
  if (!law || !currentQuestion) return <PlayerState><div className="rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm"><h1 className="text-2xl font-black text-[#062a5f]">Nenhuma questão neste baralho</h1><p className="mt-2 text-slate-600">Escolha outro capítulo, seção ou legislação.</p><BackToDecks /></div></PlayerState>;

  const isLastQuestion = currentIndex === questions.length - 1;
  const breadcrumbs = [law.titulo, currentQuestion.titulo, currentQuestion.capitulo, currentQuestion.secao, currentQuestion.subsecao].filter(Boolean);

  return <main className="min-h-screen bg-white px-1 py-2 sm:px-4 sm:py-4">
    <section className="mx-auto w-full max-w-6xl overflow-hidden rounded-[22px] border border-blue-500 bg-white shadow-[0_0_18px_rgba(37,99,235,0.12)]">
      <header className="flex min-h-[52px] items-center justify-between bg-[#0c2f5c] px-5 text-white"><div className="flex items-center gap-3"><span className="flex h-7 w-7 items-center justify-center rounded-full border border-cyan-400 text-sm text-cyan-300">⚡</span><span className="text-sm font-black">Legislação em Questões</span></div><span className="text-[11px] font-bold text-slate-200">4.0</span></header>
      <div className="px-5 py-5 sm:px-9 sm:py-6">
        <section><div className="flex items-center gap-3"><div className="relative h-[22px] flex-1 overflow-hidden rounded-full border border-blue-200 bg-[#f5f7fa]"><div className="absolute inset-y-0 left-0 rounded-full bg-blue-600 transition-all" style={{ width: `${progress}%` }} /><span className="absolute left-4 top-1/2 -translate-y-1/2 text-[10px] font-black text-white">Seu progresso</span></div><div className="flex h-[38px] min-w-[56px] items-center justify-center rounded-full border border-blue-600 px-3 text-sm font-black text-blue-600">{progress}%</div></div><div className="mt-2 flex flex-wrap items-center gap-1 text-[10px] text-slate-500"><span>♙</span>{breadcrumbs.map((item, index) => <span key={`${item}-${index}`}>{index ? <>› </> : null}{item}</span>)}</div></section>
        <section className="mt-6 rounded-2xl border border-blue-200 bg-white px-5 py-5 sm:px-6 sm:py-6"><p className="text-[18px] leading-[1.55] text-slate-600 sm:text-[20px]">Conforme o(a) <strong className="font-black text-blue-600">{law.titulo}</strong>, julgue o item que se segue.</p><p className="mt-4 whitespace-pre-wrap text-[20px] leading-[1.55] text-black sm:text-[22px]">{currentQuestion.pergunta}</p></section>
        <section className="mt-7 grid grid-cols-2 gap-5"><AnswerButton
  label="Certo"
  value="certo"
  selectedAnswer={selectedAnswer}
  onClick={() => answer("certo")}
/>
<AnswerButton label="Errado" value="errado" selectedAnswer={selectedAnswer} onClick={() => answer("errado")} /></section>
        {answered ? <><div className="my-7 border-t border-slate-200" /><section
  className={`rounded-xl border px-4 py-4 ${
    userWasCorrect
      ? "border-emerald-300 bg-emerald-50"
      : "border-red-300 bg-red-50"
  }`}
>
  <p
    className={`text-[10px] font-semibold ${
      userWasCorrect
        ? "text-emerald-700"
        : "text-red-700"
    }`}
  >
    {userWasCorrect
      ? "Resposta correta."
      : "Resposta diferente do gabarito."}
  </p>

  <p className="mt-3 pl-9 text-[11px] font-semibold text-slate-900">
    Gabarito •{" "}
    <strong>
      {correctAnswer === "certo"
        ? "Certo"
        : correctAnswer === "errado"
        ? "Errado"
        : currentQuestion.resposta}
    </strong>
  </p>
</section>{currentQuestion.justificativa ? <section className="mt-8"><h2 className="text-[21px] font-black text-slate-900 sm:text-[23px]"><span className="mr-1 text-blue-600">▼</span>Comentário do professor</h2><div className="mt-6 whitespace-pre-wrap text-[13px] leading-6 text-slate-700">{currentQuestion.justificativa}</div></section> : null}{currentQuestion.legislacao ? <section className="mt-5"><p className="text-[13px] font-black text-blue-700">📜 {currentQuestion.assunto || currentQuestion.artigo || "Trecho da Legislação"}</p><div className="mt-3 border-l-2 border-blue-600 pl-4"><div className="whitespace-pre-wrap text-[12px] leading-6 text-slate-700">{currentQuestion.legislacao}</div></div></section> : null}<section className="mt-6 grid grid-cols-3 gap-2"><InactiveAction label="🤖 LegisBot" /><InactiveAction label="♡ Comunidade" /><InactiveAction label="🖍 Destaques" /></section><section className="mt-6 flex items-center justify-between border-t border-slate-200 pt-5"><span className="text-[11px] font-semibold text-slate-400">Questão {currentIndex + 1} de {questions.length}</span>{isLastQuestion ? <Link href="/questoes" className="inline-flex min-h-10 items-center justify-center rounded-lg bg-blue-700 px-5 text-xs font-black text-white">Concluir</Link> : <button type="button" onClick={nextQuestion} className="min-h-10 rounded-lg bg-blue-700 px-5 text-xs font-black text-white transition hover:bg-blue-600">Próxima questão →</button>}</section></> : <p className="mt-5 text-center text-[11px] font-semibold text-slate-400">Questão {currentIndex + 1} de {questions.length}</p>}
      </div>
    </section>
  </main>;
}

function BackToDecks() { return <Link href="/questoes" className="mt-5 inline-flex min-h-11 items-center justify-center rounded-xl bg-blue-700 px-5 py-3 font-black text-white">Voltar aos baralhos</Link>; }
function InactiveAction({ label }: { label: string }) { return <button type="button" disabled className="min-h-[32px] rounded-md border border-blue-200 bg-white px-3 text-[10px] font-bold text-slate-600">{label}</button>; }
function AnswerButton({
  label,
  value,
  selectedAnswer,
  onClick,
}: {
  label: string;
  value: AnswerChoice;
  selectedAnswer: AnswerChoice | null;
  onClick: () => void;
}) {
  const selected = selectedAnswer === value;
  const hasAnswered = selectedAnswer !== null;

  return (
    <button
      type="button"
      disabled={hasAnswered}
      onClick={onClick}
      className={
        selected
          ? "min-h-12 rounded-xl border-2 border-blue-700 bg-blue-700 px-5 py-3 text-sm font-black text-white"
          : "min-h-12 rounded-xl border-2 border-blue-600 bg-white px-5 py-3 text-sm font-black text-blue-600 transition hover:bg-blue-50 disabled:opacity-60"
      }
    >
      {label}
    </button>
  );
}
function normalizeAnswer(value: string): AnswerChoice | null { const normalized = value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase(); if (["certo", "certa", "correto", "correta"].includes(normalized)) return "certo"; if (["errado", "errada", "incorreto", "incorreta"].includes(normalized)) return "errado"; return null; }
