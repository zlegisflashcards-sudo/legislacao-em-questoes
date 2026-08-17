"use client";

import Image from "next/image";
import { useEffect, useMemo, useState } from "react";
import { StudentAreaTabs } from "@/components/student-area-tabs";
import {
  ANKI_PLATFORM_IDS,
  DEFAULT_ANKI_PLATFORM,
  clearAnkiConfigured,
  getAnkiYoutubeEmbedUrl,
  markAnkiConfigured,
  readAnkiConfigured,
  type AnkiPlatformId,
} from "@/lib/anki-study";
import { resolveAnkiPlatformTutorials, type AnkiTutorialSettings } from "@/lib/anki-tutorial-settings";
import { supabase } from "@/lib/supabase";

type SessionStatus = "loading" | "ready" | "error";
type AnkiSetupStatus = "loading" | "pending" | "configured";

const LOGIN_URL = "/conta?modo=login&retorno=%2Festudar%2Fanki";

export function AnkiStudyPageClient({ settings, publicMode = false }: { settings: AnkiTutorialSettings | null; publicMode?: boolean }) {
  const [sessionStatus, setSessionStatus] = useState<SessionStatus>(publicMode ? "ready" : "loading");
  const [userId, setUserId] = useState<string | null>(null);
  const [setupStatus, setSetupStatus] = useState<AnkiSetupStatus>("loading");
  const [activePlatform, setActivePlatform] = useState<AnkiPlatformId>(DEFAULT_ANKI_PLATFORM);
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (publicMode) return;
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
  }, [publicMode]);

  const tutorials = useMemo(() => resolveAnkiPlatformTutorials(settings), [settings]);
  const tutorial = tutorials[activePlatform];
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
    {!publicMode ? <StudentAreaTabs activeTab="leis" minhasLeisHref="/minhas-leis" /> : null}

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
            <p className="mt-3 font-bold text-slate-800">Nesta mini aula, vamos apenas baixar e instalar o aplicativo. Na próxima aula, você vai baixar as questões.</p>
          </div>
        </div>
      </header>

      <section id="anki-platforms" aria-labelledby="anki-platforms-title" className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-8">
        <h2 id="anki-platforms-title" className="text-2xl font-black text-[#062a5f]">Escolha a versão do Anki que você vai usar</h2>
        <p className="mt-2 text-slate-600"><strong>Não sabe qual escolher?</strong> Escolha o dispositivo que pretende usar mais para estudar. Você pode usar outros dispositivos depois e manter seu progresso sincronizado.</p>
        <details className="mt-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
          <summary className="cursor-pointer font-bold text-blue-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700">Ver qual opção é ideal para mim</summary>
          <div className="mt-3 grid gap-2 leading-relaxed">
            <p><strong>Celular ou tablet:</strong> mais prático para estudar em qualquer lugar. Escolha Android ou iOS abaixo.</p>
            <p><strong>Computador:</strong> ótimo para estudar e organizar seus materiais. Selecione Computador abaixo.</p>
            <p><strong>Navegador:</strong> aguarde novidades.</p>
          </div>
        </details>
        <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4" aria-label="Plataformas do Anki">
          {ANKI_PLATFORM_IDS.map((platformId) => {
            const selected = platformId === activePlatform;
            const unavailable = platformId === "navegador";
            return <button key={platformId} type="button" disabled={unavailable} aria-pressed={selected} onClick={() => setActivePlatform(platformId)} className={`min-h-12 rounded-xl border px-4 py-3 font-black transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700 ${unavailable ? "cursor-not-allowed border-slate-200 bg-slate-100 text-slate-400" : selected ? "border-blue-700 bg-blue-700 text-white" : "border-slate-300 bg-white text-slate-700 hover:border-blue-400 hover:bg-blue-50"}`}>{tutorials[platformId].label}</button>;
          })}
        </div>

        {embedUrl ? <div className="mt-6 overflow-hidden rounded-2xl border border-slate-200 bg-slate-950"><iframe key={activePlatform} src={embedUrl} title={`Tutorial do Anki para ${tutorial.label}`} className="aspect-video w-full" loading="lazy" referrerPolicy="strict-origin-when-cross-origin" allow="accelerometer; encrypted-media; gyroscope; picture-in-picture" allowFullScreen /></div> : null}

        <div className="mt-6 flex min-w-0 flex-col gap-4 rounded-2xl border border-blue-100 bg-blue-50 p-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <h3 className="text-xl font-black text-[#062a5f]">{tutorial.label}</h3>
            <p className="mt-1 text-slate-700">{tutorial.description}</p>
            {tutorial.note ? <p className="mt-2 text-sm font-semibold text-slate-600">{tutorial.note}</p> : null}
          </div>
          {tutorial.officialUrl ? <a href={tutorial.officialUrl} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-12 shrink-0 items-center justify-center rounded-xl bg-blue-700 px-5 py-3 text-center font-black text-white transition hover:bg-blue-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700">{tutorial.buttonLabel}</a> : null}
        </div>
      </section>

      {!publicMode ? <section aria-labelledby="anki-status-title" className="rounded-3xl border border-blue-200 bg-[#eaf3ff] p-6 sm:p-8">
        <label className="flex min-h-12 cursor-pointer items-center gap-3 rounded-xl border border-blue-200 bg-white px-4 py-3">
          <input type="checkbox" checked={setupStatus === "configured"} onChange={(event) => event.target.checked ? markConfigured() : markPending()} className="h-5 w-5 shrink-0 accent-blue-700" />
          <span id="anki-status-title" className="font-black text-[#062a5f]">Marcar como concluído</span>
        </label>
        {message ? <p role="alert" className="mt-3 text-sm font-bold text-red-700">{message}</p> : null}
      </section> : null}

      <section aria-labelledby="anki-next-step-title" className="rounded-3xl border border-blue-200 bg-white p-6 shadow-sm sm:p-8">
        <h2 id="anki-next-step-title" className="text-2xl font-black text-[#062a5f]">Agora que você instalou e configurou o Anki:</h2>
        {publicMode ? <><p className="mt-4 text-slate-700">Seu aplicativo já está preparado para receber os materiais.</p><p className="mt-5 font-bold text-slate-800">Próximo passo: vamos colocar tudo em prática.</p><p className="mt-2 text-slate-700">Use nossa amostra gratuita da Constituição Federal para aprender a baixar, importar e começar a estudar os flashcards.</p><a href="#amostra-gratis" className="mt-5 inline-flex min-h-12 items-center justify-center rounded-xl bg-blue-700 px-5 py-3 font-black text-white transition hover:bg-blue-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700">Começar com a amostra grátis</a></> : <><ul className="mt-4 grid gap-2 text-slate-700"><li>Sua conta está pronta;</li><li>A sincronização está configurada;</li><li>O aplicativo está preparado para receber seus materiais.</li></ul><p className="mt-5 font-bold text-slate-800">Próximo passo: escolha uma legislação para baixar, importar e começar a estudar.</p><a href="/minhas-leis" className="mt-5 inline-flex min-h-12 items-center justify-center rounded-xl bg-blue-700 px-5 py-3 font-black text-white transition hover:bg-blue-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700">Escolher uma lei para estudar</a></>}
      </section>
    </div> : null}
  </div>;
}
