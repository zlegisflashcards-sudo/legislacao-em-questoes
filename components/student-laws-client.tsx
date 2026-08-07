"use client";

import Link from "next/link";
import Image from "next/image";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { StudentAreaTabs, type StudentAreaTabId } from "@/components/student-area-tabs";
import { readAnkiConfigured, shouldPromptBeforeLawStudy } from "@/lib/anki-study";
import { filterStudentLaws, studentLawShortNameForDisplay, type StudentLaw } from "@/lib/student-laws";
import { supabase } from "@/lib/supabase";

type StudentLawsResponse = { leis?: StudentLaw[]; total?: number; message?: string };
type AnkiSetupStatus = "loading" | "pending" | "configured";

async function studentRequest() {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  const userId = data.session?.user.id ?? null;
  if (!token || !userId) return { response: new Response(null, { status: 401 }), userId: null };
  return {
    response: await fetch("/api/aluno/minhas-leis", {
      cache: "no-store",
      headers: { Authorization: `Bearer ${token}` },
    }),
    userId,
  };
}

export function StudentLawsClient() {
  const [activeTab, setActiveTab] = useState<StudentAreaTabId>("leis");
  const [laws, setLaws] = useState<StudentLaw[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [userId, setUserId] = useState<string | null>(null);
  const [ankiStatus, setAnkiStatus] = useState<AnkiSetupStatus>("loading");
  const [pendingLawHref, setPendingLawHref] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    async function load() {
      try {
        const { response, userId: authenticatedUserId } = await studentRequest();
        if (response.status === 401) {
          window.location.replace("/conta?modo=login&retorno=%2Fminhas-leis");
          return;
        }
        if (active) setUserId(authenticatedUserId);
        const result = await response.json() as StudentLawsResponse;
        if (!response.ok || !Array.isArray(result.leis)) throw new Error(result.message);
        if (active) setLaws(result.leis);
      } catch {
        if (active) setError("Não foi possível carregar suas leis. Tente novamente em instantes.");
      } finally {
        if (active) setLoading(false);
      }
    }
    void load();
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!userId) return;
    setAnkiStatus(readAnkiConfigured(window.localStorage, userId) ? "configured" : "pending");
  }, [userId]);

  const closeAnkiPrompt = useCallback(() => setPendingLawHref(null), []);

  const filteredLaws = useMemo(() => filterStudentLaws(laws, search), [laws, search]);

  return <div className="mx-auto w-full max-w-6xl px-4 py-10 sm:px-6 sm:py-14">
    <header className="mb-8">
      <p className="font-bold text-blue-700">Área do aluno</p>
      <h1 className="mt-1 text-3xl font-black tracking-tight text-[#062a5f] sm:text-4xl">Minhas leis adquiridas</h1>
      <p className="mt-3 max-w-2xl text-slate-600">Acesse as leis liberadas para sua conta e prepare sua rotina de estudo.</p>
    </header>

    <StudentAreaTabs activeTab={activeTab} onTabChange={setActiveTab} />

    {activeTab === "leis" ? <section id="student-laws-panel" role="tabpanel" aria-label="Minhas leis" className="grid gap-6">
      <AnkiModule status={ankiStatus} />

      {!loading && !error && laws.length > 0 ? <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <label htmlFor="student-laws-search" className="text-sm font-black text-slate-800">Pesquisar nas minhas leis</label>
        <input id="student-laws-search" type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Título, código ou nome curto" className="mt-2 min-h-12 w-full rounded-xl border border-slate-300 px-4 text-slate-900 outline-none transition focus:border-blue-600 focus:ring-2 focus:ring-blue-100" />
        <p className="mt-3 text-sm font-semibold text-slate-500" aria-live="polite">{laws.length} {laws.length === 1 ? "lei liberada" : "leis liberadas"}</p>
      </div> : null}

      {loading ? <div role="status" className="rounded-2xl border border-blue-100 bg-white p-8 text-slate-600 shadow-sm">Carregando suas leis…</div> : null}
      {!loading && error ? <ErrorState message={error} /> : null}
      {!loading && !error && laws.length === 0 ? <EmptyState /> : null}
      {!loading && !error && laws.length > 0 && filteredLaws.length === 0 ? <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm"><h2 className="text-xl font-black text-[#062a5f]">Nenhuma lei encontrada</h2><p className="mt-2 text-slate-600">Tente pesquisar por outro título, código ou nome curto.</p></div> : null}
      {!loading && !error && filteredLaws.length > 0 ? <div className="grid gap-4" aria-label="Leis liberadas">{filteredLaws.map((law) => <StudentLawCard key={law.id} law={law} ankiConfigured={ankiStatus === "configured"} onAnkiRequired={setPendingLawHref} />)}</div> : null}
    </section> : <section id="student-exam-panel" role="tabpanel" aria-label="Meu edital" className="rounded-3xl border border-blue-100 bg-white p-8 text-center shadow-sm sm:p-12">
      <p className="text-xs font-black uppercase tracking-[0.16em] text-blue-700">Em breve</p>
      <h2 className="mt-3 text-2xl font-black text-[#062a5f]">Meu edital</h2>
      <p className="mx-auto mt-3 max-w-xl text-slate-600">Organize suas leis em um edital personalizado para acompanhar seu estudo.</p>
      <button type="button" disabled className="mt-6 min-h-11 rounded-xl bg-slate-300 px-5 py-3 font-black text-slate-600">Montar meu edital — em breve</button>
    </section>}

    {pendingLawHref ? <AnkiRequiredModal lawHref={pendingLawHref} onClose={closeAnkiPrompt} /> : null}
  </div>;
}

function AnkiModule({ status }: { status: AnkiSetupStatus }) {
  const configured = status === "configured";

  return <aside aria-labelledby="anki-module-title" className="grid grid-cols-[4rem_minmax(0,1fr)] items-start gap-x-4 gap-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:flex sm:flex-row sm:items-center sm:gap-5">
    <AnkiIcon />
    <div className="contents sm:block sm:min-w-0 sm:flex-1">
      <div className="min-w-0 self-start">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-xs font-black uppercase tracking-wide text-blue-700">Passo obrigatório</p>
          <span role="status" className={`rounded-full px-2.5 py-1 text-xs font-black ${configured ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-900"}`}>
            {status === "loading" ? "Verificando" : configured ? "Anki configurado" : "Pendente"}
          </span>
        </div>
        <h2 id="anki-module-title" className="mt-1 break-words text-xl font-black text-[#062a5f]">Baixando e configurando o App de questões</h2>
      </div>
      <p className="col-span-2 text-sm leading-relaxed text-slate-600 sm:mt-3">O Anki é o aplicativo de questões utilizado no nosso método de estudo. Nele, você responde às questões em formato de flashcards e informa o nível de dificuldade de cada resposta. Com base no seu desempenho, o próprio aplicativo organiza as revisões e reapresenta cada questão no momento adequado.</p>
    </div>
    <Link href="/estudar/anki" className="col-span-2 inline-flex min-h-11 w-full shrink-0 items-center justify-center rounded-xl bg-blue-700 px-5 py-3 text-center font-black text-white transition hover:bg-blue-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700 sm:w-auto">{configured ? "Reabrir tutorial" : "Configurar o App de Questões"}</Link>
  </aside>;
}

function AnkiIcon() {
  return <span className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-blue-50 sm:h-20 sm:w-20">
    <Image src="/icons/anki.png" alt="Ícone do Anki" width={80} height={80} sizes="(max-width: 639px) 64px, 80px" className="h-16 w-16 object-contain sm:h-20 sm:w-20" />
  </span>;
}

function StudentLawCard({ law, ankiConfigured, onAnkiRequired }: { law: StudentLaw; ankiConfigured: boolean; onAnkiRequired: (lawHref: string) => void }) {
  const shortName = studentLawShortNameForDisplay(law);
  const lawHref = `/estudar/lei/${encodeURIComponent(law.slug)}`;
  return <article className="grid grid-cols-[4rem_minmax(0,1fr)] items-start gap-x-4 gap-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:flex sm:flex-row sm:items-center sm:gap-5">
    {law.thumbnailUrl ? <div role="img" aria-label={`Miniatura de ${law.titulo}`} className="h-16 w-16 shrink-0 rounded-xl bg-slate-100 bg-contain bg-center bg-no-repeat sm:h-28 sm:w-40 sm:bg-cover" style={{ backgroundImage: `url(${law.thumbnailUrl})` }} /> : <div aria-hidden="true" className="flex h-16 w-16 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-2xl sm:h-20 sm:w-20 sm:text-3xl">⚖️</div>}
    <div className="contents sm:block sm:min-w-0 sm:flex-1">
      <div className="min-w-0 self-start">
        {law.codigo ? <p className="text-xs font-black uppercase tracking-wide text-blue-700">{law.codigo}</p> : null}
        <h2 className="mt-1 break-words text-xl font-black text-[#062a5f]">{law.titulo}</h2>
        {shortName ? <p className="mt-1 break-words text-sm font-medium text-slate-500">{shortName}</p> : null}
      </div>
      {law.descricao ? <p className="col-span-2 line-clamp-2 text-sm leading-relaxed text-slate-600 sm:mt-3">{law.descricao}</p> : null}
      {law.totalFlashcards > 0 ? <p className="col-span-2 border-t border-slate-100 pt-4 text-sm font-semibold text-slate-600 sm:mt-4">{law.totalFlashcards} flashcards</p> : null}
    </div>
    <Link href={lawHref} onClick={(event) => {
      if (!shouldPromptBeforeLawStudy(ankiConfigured)) return;
      event.preventDefault();
      onAnkiRequired(lawHref);
    }} className="col-span-2 inline-flex min-h-11 w-full shrink-0 items-center justify-center rounded-xl bg-blue-700 px-5 py-3 text-center font-black text-white transition hover:bg-blue-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700 sm:w-auto">Baixar questões</Link>
  </article>;
}

function AnkiRequiredModal({ lawHref, onClose }: { lawHref: string; onClose: () => void }) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const primaryActionRef = useRef<HTMLAnchorElement>(null);

  useEffect(() => {
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    primaryActionRef.current?.focus();

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== "Tab") return;

      const focusable = Array.from(dialogRef.current?.querySelectorAll<HTMLElement>('a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])') ?? []);
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = previousOverflow;
      previousFocus?.focus();
    };
  }, [onClose]);

  return <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/55 p-4 sm:items-center" onMouseDown={onClose}>
    <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="anki-required-title" aria-describedby="anki-required-description" className="relative w-full max-w-lg rounded-3xl border border-blue-100 bg-white p-6 shadow-2xl sm:p-8" onMouseDown={(event) => event.stopPropagation()}>
      <button type="button" aria-label="Fechar aviso" onClick={onClose} className="absolute right-4 top-4 flex h-11 w-11 items-center justify-center rounded-full text-2xl text-slate-500 transition hover:bg-slate-100 hover:text-slate-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700">×</button>
      <p className="text-xs font-black uppercase tracking-[0.16em] text-blue-700">Antes de baixar</p>
      <h2 id="anki-required-title" className="mt-2 pr-10 text-2xl font-black text-[#062a5f]">Configure seu App de Questões</h2>
      <p id="anki-required-description" className="mt-4 leading-relaxed text-slate-600">Antes de começar a estudar, recomendamos configurar o Anki. Ele é o aplicativo utilizado para responder às questões e organizar automaticamente suas revisões.</p>
      <div className="mt-7 grid gap-3 sm:grid-cols-2">
        <Link ref={primaryActionRef} href="/estudar/anki" className="inline-flex min-h-12 items-center justify-center rounded-xl bg-blue-700 px-5 py-3 text-center font-black text-white transition hover:bg-blue-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700">Configurar o App de Questões</Link>
        <Link href={lawHref} className="inline-flex min-h-12 items-center justify-center rounded-xl border border-blue-200 bg-white px-5 py-3 text-center font-black text-blue-800 transition hover:bg-blue-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700">Continuar para esta lei</Link>
      </div>
    </div>
  </div>;
}

function EmptyState() {
  return <div className="rounded-3xl border border-blue-100 bg-white p-8 text-center shadow-sm sm:p-12">
    <h2 className="text-2xl font-black text-[#062a5f]">Você ainda não possui leis liberadas</h2>
    <p className="mx-auto mt-3 max-w-xl text-slate-600">Após a confirmação da sua aquisição, suas leis aparecerão aqui.</p>
    <Link href="/" className="mt-6 inline-flex min-h-11 items-center justify-center rounded-xl bg-blue-700 px-5 py-3 font-black text-white transition hover:bg-blue-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700">Acessar catálogo</Link>
  </div>;
}

function ErrorState({ message }: { message: string }) {
  return <div role="alert" className="rounded-2xl border border-red-200 bg-white p-8 text-red-700 shadow-sm"><p>{message}</p><button type="button" onClick={() => window.location.reload()} className="mt-4 rounded-xl bg-blue-700 px-5 py-3 font-black text-white">Tentar novamente</button></div>;
}
