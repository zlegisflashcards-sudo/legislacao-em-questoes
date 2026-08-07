"use client";

import Image from "next/image";
import { useEffect, useMemo, useState } from "react";
import { StudentAreaTabs } from "@/components/student-area-tabs";
import {
  ANKI_PLATFORM_IDS,
  ANKI_PLATFORM_TUTORIALS,
  DEFAULT_ANKI_PLATFORM,
  clearAnkiConfigured,
  getAnkiYoutubeEmbedUrl,
  markAnkiConfigured,
  readAnkiConfigured,
  type AnkiPlatformId,
} from "@/lib/anki-study";
import { supabase } from "@/lib/supabase";

type SessionStatus = "loading" | "ready" | "error";
type AnkiSetupStatus = "loading" | "pending" | "configured";

const LOGIN_URL = "/conta?modo=login&retorno=%2Festudar%2Fanki";

export function AnkiStudyPageClient() {
  const [sessionStatus, setSessionStatus] = useState<SessionStatus>("loading");
  const [userId, setUserId] = useState<string | null>(null);
  const [setupStatus, setSetupStatus] = useState<AnkiSetupStatus>("loading");
  const [activePlatform, setActivePlatform] = useState<AnkiPlatformId>(DEFAULT_ANKI_PLATFORM);
  const [message, setMessage] = useState("");

  useEffect(() => {
    let active = true;

    async function authenticate() {
      try {
        const { data, error } = await supabase.auth.getSession();
        if (error) throw error;
        const authenticatedUserId = data.session?.user.id;
        if (!authenticatedUserId) {
          window.location.replace(LOGIN_URL);
          return;
        }
        if (!active) return;
        setUserId(authenticatedUserId);
        setSetupStatus(readAnkiConfigured(window.localStorage, authenticatedUserId) ? "configured" : "pending");
        setSessionStatus("ready");
      } catch {
        if (!active) return;
        setSetupStatus("pending");
        setSessionStatus("error");
      }
    }

    void authenticate();
    return () => { active = false; };
  }, []);

  const tutorial = ANKI_PLATFORM_TUTORIALS[activePlatform];
  const embedUrl = useMemo(() => getAnkiYoutubeEmbedUrl(tutorial.videoUrl), [tutorial.videoUrl]);

  function markConfigured() {
    if (!userId) return;
    if (!markAnkiConfigured(window.localStorage, userId)) {
      setSetupStatus("pending");
      setMessage("Não foi possível salvar esta preferência no navegador. Tente novamente.");
      return;
    }
    setSetupStatus("configured");
    setMessage("");
  }

  function markPending() {
    if (!userId) return;
    if (!clearAnkiConfigured(window.localStorage, userId)) {
      setMessage("Não foi possível atualizar esta preferência no navegador. Tente novamente.");
      return;
    }
    setSetupStatus("pending");
    setMessage("");
  }

  return <div className="mx-auto w-full max-w-6xl px-4 py-10 sm:px-6 sm:py-14">
    <StudentAreaTabs activeTab="leis" minhasLeisHref="/minhas-leis" />

    {sessionStatus === "loading" ? <div role="status" className="rounded-2xl border border-blue-100 bg-white p-8 text-slate-600 shadow-sm"><strong className="text-[#062a5f]">Verificando</strong><span> sua sessão e o estado do Anki…</span></div> : null}
    {sessionStatus === "error" ? <div role="alert" className="rounded-2xl border border-red-200 bg-white p-8 text-red-700 shadow-sm"><p>Não foi possível verificar sua sessão. Recarregue a página e tente novamente.</p><button type="button" onClick={() => window.location.reload()} className="mt-4 rounded-xl bg-blue-700 px-5 py-3 font-black text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700">Tentar novamente</button></div> : null}

    {sessionStatus === "ready" ? <div className="grid min-w-0 gap-6">
      <header className="rounded-3xl border border-blue-100 bg-white p-6 shadow-sm sm:p-8">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
          <Image src="/icons/anki.png" alt="Ícone do Anki" width={96} height={96} sizes="(min-width: 640px) 96px, 80px" className="h-20 w-20 shrink-0 rounded-2xl object-contain sm:h-24 sm:w-24" priority />
          <div className="min-w-0">
            <p className="text-xs font-black uppercase tracking-wide text-blue-700">Passo obrigatório</p>
            <h1 className="mt-2 text-3xl font-black tracking-tight text-[#062a5f] sm:text-4xl">Baixando e configurando o Anki</h1>
            <p className="mt-4 max-w-4xl leading-relaxed text-slate-600">O Anki é o aplicativo de questões utilizado no nosso método de estudo. Nele, você responde às questões em formato de flashcards e informa o nível de dificuldade de cada resposta. Com base no seu desempenho, o próprio aplicativo organiza as revisões e reapresenta cada questão no momento adequado.</p>
            <p className="mt-3 font-bold text-slate-800">Configure o Anki antes de baixar e estudar seus materiais.</p>
          </div>
        </div>
      </header>

      <section id="anki-platforms" aria-labelledby="anki-platforms-title" className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-8">
        <h2 id="anki-platforms-title" className="text-2xl font-black text-[#062a5f]">Escolha onde você usará o Anki</h2>
        <p className="mt-2 text-slate-600">Você pode escolher apenas uma plataforma para fazer as questões ou usar todas sincronizadas.</p>
        <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4" aria-label="Plataformas do Anki">
          {ANKI_PLATFORM_IDS.map((platformId) => {
            const selected = platformId === activePlatform;
            return <button key={platformId} type="button" aria-pressed={selected} onClick={() => setActivePlatform(platformId)} className={`min-h-12 rounded-xl border px-4 py-3 font-black transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700 ${selected ? "border-blue-700 bg-blue-700 text-white" : "border-slate-300 bg-white text-slate-700 hover:border-blue-400 hover:bg-blue-50"}`}>{ANKI_PLATFORM_TUTORIALS[platformId].label}</button>;
          })}
        </div>

        <div className="mt-6 overflow-hidden rounded-2xl border border-slate-200 bg-slate-950">
          {embedUrl ? <iframe key={activePlatform} src={embedUrl} title={`Tutorial do Anki para ${tutorial.label}`} className="aspect-video w-full" loading="lazy" referrerPolicy="strict-origin-when-cross-origin" allow="accelerometer; encrypted-media; gyroscope; picture-in-picture" allowFullScreen /> : <div key={activePlatform} role="status" aria-live="polite" className="flex aspect-video w-full flex-col items-center justify-center px-6 text-center text-slate-200"><p className="text-lg font-black">Tutorial em preparação</p><p className="mt-2 text-sm text-slate-400">O vídeo para {tutorial.label} será disponibilizado aqui.</p></div>}
        </div>

        <div className="mt-6 flex min-w-0 flex-col gap-4 rounded-2xl border border-blue-100 bg-blue-50 p-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <h3 className="text-xl font-black text-[#062a5f]">{tutorial.label}</h3>
            <p className="mt-1 text-slate-700">{tutorial.description}</p>
            <p className="mt-2 text-sm font-semibold text-slate-600">{tutorial.note}</p>
          </div>
          <a href={tutorial.officialUrl} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-12 shrink-0 items-center justify-center rounded-xl bg-blue-700 px-5 py-3 text-center font-black text-white transition hover:bg-blue-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700">{tutorial.buttonLabel}</a>
        </div>
      </section>

      <section aria-labelledby="anki-instructions-title" className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
        <h2 id="anki-instructions-title" className="text-2xl font-black text-[#062a5f]">Neste tutorial, você aprenderá a:</h2>
        <ul className="mt-4 grid gap-3 text-slate-700 sm:grid-cols-2">
          <li className="rounded-xl bg-blue-50 px-4 py-3 font-semibold">Instalar ou acessar o Anki.</li>
          <li className="rounded-xl bg-blue-50 px-4 py-3 font-semibold">Criar e entrar na sua conta.</li>
          <li className="rounded-xl bg-blue-50 px-4 py-3 font-semibold">Ativar a sincronização.</li>
          <li className="rounded-xl bg-blue-50 px-4 py-3 font-semibold">Preparar o aplicativo para importar os materiais.</li>
        </ul>
      </section>

      <section aria-labelledby="anki-status-title" className="rounded-3xl border border-blue-200 bg-[#eaf3ff] p-6 sm:p-8">
        <label className="flex min-h-12 cursor-pointer items-center gap-3 rounded-xl border border-blue-200 bg-white px-4 py-3">
          <input type="checkbox" checked={setupStatus === "configured"} onChange={(event) => event.target.checked ? markConfigured() : markPending()} className="h-5 w-5 shrink-0 accent-blue-700" />
          <span id="anki-status-title" className="font-black text-[#062a5f]">Marcar como concluído</span>
        </label>
        {message ? <p role="alert" className="mt-3 text-sm font-bold text-red-700">{message}</p> : null}
      </section>
    </div> : null}
  </div>;
}
