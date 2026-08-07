"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { filterStudentLaws, studentLawShortNameForDisplay, type StudentLaw } from "@/lib/student-laws";
import { supabase } from "@/lib/supabase";

type StudentLawsResponse = { leis?: StudentLaw[]; total?: number; message?: string };
type ActiveTab = "leis" | "edital";
type AnkiSetupStatus = "loading" | "pending" | "configured";

const ANKI_SETUP_STORAGE_PREFIX = "legisflashcards:anki-configured:";

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
  const [activeTab, setActiveTab] = useState<ActiveTab>("leis");
  const [laws, setLaws] = useState<StudentLaw[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [userId, setUserId] = useState<string | null>(null);

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

  const filteredLaws = useMemo(() => filterStudentLaws(laws, search), [laws, search]);

  return <div className="mx-auto w-full max-w-6xl px-4 py-10 sm:px-6 sm:py-14">
    <header className="mb-8">
      <p className="font-bold text-blue-700">Área do aluno</p>
      <h1 className="mt-1 text-3xl font-black tracking-tight text-[#062a5f] sm:text-4xl">Minhas leis adquiridas</h1>
      <p className="mt-3 max-w-2xl text-slate-600">Acesse as leis liberadas para sua conta e prepare sua rotina de estudo.</p>
    </header>

    <div role="tablist" aria-label="Minhas leis adquiridas" className="mb-6 flex gap-2 border-b border-slate-200">
      <button type="button" role="tab" aria-selected={activeTab === "leis"} aria-controls="student-laws-panel" onClick={() => setActiveTab("leis")} className={`border-b-2 px-4 py-3 font-black transition ${activeTab === "leis" ? "border-blue-700 text-blue-700" : "border-transparent text-slate-600 hover:text-blue-700"}`}>Minhas leis</button>
      <button type="button" role="tab" aria-selected={activeTab === "edital"} aria-controls="student-exam-panel" onClick={() => setActiveTab("edital")} className={`border-b-2 px-4 py-3 font-black transition ${activeTab === "edital" ? "border-blue-700 text-blue-700" : "border-transparent text-slate-600 hover:text-blue-700"}`}>Meu edital</button>
    </div>

    {activeTab === "leis" ? <section id="student-laws-panel" role="tabpanel" aria-label="Minhas leis" className="grid gap-6">
      <AnkiModule userId={userId} />

      {!loading && !error && laws.length > 0 ? <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <label htmlFor="student-laws-search" className="text-sm font-black text-slate-800">Pesquisar nas minhas leis</label>
        <input id="student-laws-search" type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Título, código ou nome curto" className="mt-2 min-h-12 w-full rounded-xl border border-slate-300 px-4 text-slate-900 outline-none transition focus:border-blue-600 focus:ring-2 focus:ring-blue-100" />
        <p className="mt-3 text-sm font-semibold text-slate-500" aria-live="polite">{laws.length} {laws.length === 1 ? "lei liberada" : "leis liberadas"}</p>
      </div> : null}

      {loading ? <div role="status" className="rounded-2xl border border-blue-100 bg-white p-8 text-slate-600 shadow-sm">Carregando suas leis…</div> : null}
      {!loading && error ? <ErrorState message={error} /> : null}
      {!loading && !error && laws.length === 0 ? <EmptyState /> : null}
      {!loading && !error && laws.length > 0 && filteredLaws.length === 0 ? <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm"><h2 className="text-xl font-black text-[#062a5f]">Nenhuma lei encontrada</h2><p className="mt-2 text-slate-600">Tente pesquisar por outro título, código ou nome curto.</p></div> : null}
      {!loading && !error && filteredLaws.length > 0 ? <div className="grid gap-4" aria-label="Leis liberadas">{filteredLaws.map((law) => <StudentLawCard key={law.id} law={law} />)}</div> : null}
    </section> : <section id="student-exam-panel" role="tabpanel" aria-label="Meu edital" className="rounded-3xl border border-blue-100 bg-white p-8 text-center shadow-sm sm:p-12">
      <p className="text-xs font-black uppercase tracking-[0.16em] text-blue-700">Em breve</p>
      <h2 className="mt-3 text-2xl font-black text-[#062a5f]">Meu edital</h2>
      <p className="mx-auto mt-3 max-w-xl text-slate-600">Organize suas leis em um edital personalizado para acompanhar seu estudo.</p>
      <button type="button" disabled className="mt-6 min-h-11 rounded-xl bg-slate-300 px-5 py-3 font-black text-slate-600">Montar meu edital — em breve</button>
    </section>}
  </div>;
}

function AnkiModule({ userId }: { userId: string | null }) {
  const [status, setStatus] = useState<AnkiSetupStatus>("loading");
  const [tutorialOpen, setTutorialOpen] = useState(false);

  useEffect(() => {
    if (!userId) return;
    try {
      setStatus(window.localStorage.getItem(`${ANKI_SETUP_STORAGE_PREFIX}${userId}`) === "true" ? "configured" : "pending");
    } catch {
      setStatus("pending");
    }
  }, [userId]);

  function markConfigured() {
    if (userId) {
      try {
        window.localStorage.setItem(`${ANKI_SETUP_STORAGE_PREFIX}${userId}`, "true");
      } catch {
        // O estado visual continua funcionando mesmo quando o armazenamento local está indisponível.
      }
    }
    setStatus("configured");
    setTutorialOpen(false);
  }

  const configured = status === "configured";

  return <aside aria-labelledby="anki-module-title" className="rounded-3xl border-2 border-blue-300 bg-gradient-to-br from-[#062a5f] to-blue-700 p-6 text-white shadow-md ring-4 ring-blue-50 sm:p-8">
    <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
      <div className="flex min-w-0 gap-4">
        <AnkiIcon />
        <div className="min-w-0">
          <div className="flex flex-wrap gap-2">
            <span className="rounded-full bg-white px-3 py-1 text-xs font-black uppercase tracking-[0.12em] text-blue-800">Passo 1</span>
            <span className="rounded-full border border-blue-200 bg-blue-950/35 px-3 py-1 text-xs font-black uppercase tracking-[0.12em] text-white">Obrigatório</span>
            <span role="status" className={`rounded-full px-3 py-1 text-xs font-black uppercase tracking-[0.12em] ${configured ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-900"}`}>
              {status === "loading" ? "Verificando" : configured ? "Anki configurado" : "Pendente"}
            </span>
          </div>
          <h2 id="anki-module-title" className="mt-4 text-2xl font-black">Instale e configure o Anki</h2>
          <p className="mt-3 max-w-2xl font-semibold text-blue-50">Comece por aqui. Configure o Anki antes de baixar e estudar seus materiais.</p>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-blue-100">Esta orientação organiza sua jornada, mas não bloqueia o acesso às leis, materiais ou demais recursos da sua conta.</p>
        </div>
      </div>
      <button type="button" onClick={() => setTutorialOpen(true)} className="inline-flex min-h-11 shrink-0 items-center justify-center rounded-xl bg-white px-5 py-3 font-black text-blue-800 transition hover:bg-blue-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white">
        {configured ? "Reabrir tutorial" : "Configurar Anki"}
      </button>
    </div>

    {tutorialOpen ? <div className="mt-6 rounded-2xl border border-white/30 bg-white/10 p-5" aria-label="Tutorial de configuração do Anki">
      <h3 className="text-lg font-black">Configuração inicial</h3>
      <ol className="mt-3 grid gap-2 text-sm leading-relaxed text-blue-50">
        <li><strong>1.</strong> Instale o Anki no dispositivo em que você estudará.</li>
        <li><strong>2.</strong> Abra o aplicativo e conclua a configuração inicial.</li>
        <li><strong>3.</strong> Volte aqui e marque este passo como configurado.</li>
      </ol>
      <p className="mt-4 text-sm leading-relaxed text-blue-100">Existe um único deck oficial, completo e atualizado. Quando houver uma nova versão, exclua o deck antigo e importe o novo: isso evita duplicidades, mas reinicia o progresso no Anki. Não há atualização incremental.</p>
      <div className="mt-5 flex flex-wrap gap-3">
        <a href="https://apps.ankiweb.net/" target="_blank" rel="noreferrer" className="inline-flex min-h-11 items-center justify-center rounded-xl border border-white/50 px-4 py-2 font-black text-white transition hover:bg-white/10">Baixar o Anki</a>
        <button type="button" onClick={markConfigured} className="min-h-11 rounded-xl bg-emerald-100 px-4 py-2 font-black text-emerald-900 transition hover:bg-emerald-50">Marcar como configurado</button>
        <button type="button" onClick={() => setTutorialOpen(false)} className="min-h-11 rounded-xl px-4 py-2 font-bold text-blue-100 transition hover:bg-white/10">Fechar tutorial</button>
      </div>
    </div> : null}
  </aside>;
}

function AnkiIcon() {
  return <span aria-hidden="true" className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border border-white/40 bg-white text-3xl font-black text-blue-700 shadow-sm">✦</span>;
}

function StudentLawCard({ law }: { law: StudentLaw }) {
  const shortName = studentLawShortNameForDisplay(law);
  return <article className="flex flex-col gap-5 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:flex-row sm:items-center">
    {law.thumbnailUrl ? <div role="img" aria-label={`Miniatura de ${law.titulo}`} className="h-28 w-full shrink-0 rounded-xl bg-slate-100 bg-cover bg-center sm:w-40" style={{ backgroundImage: `url(${law.thumbnailUrl})` }} /> : <div aria-hidden="true" className="flex h-20 w-20 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-3xl">⚖️</div>}
    <div className="min-w-0 flex-1">
      {law.codigo ? <p className="text-xs font-black uppercase tracking-wide text-blue-700">{law.codigo}</p> : null}
      <h2 className="mt-1 text-xl font-black text-[#062a5f]">{law.titulo}</h2>
      {shortName ? <p className="mt-1 text-sm font-medium text-slate-500">{shortName}</p> : null}
      {law.descricao ? <p className="mt-3 line-clamp-2 text-sm leading-relaxed text-slate-600">{law.descricao}</p> : null}
      {law.totalFlashcards > 0 ? <p className="mt-4 border-t border-slate-100 pt-4 text-sm font-semibold text-slate-600">{law.totalFlashcards} flashcards</p> : null}
    </div>
    <button type="button" disabled title="Área de estudo em preparação" className="min-h-11 shrink-0 rounded-xl bg-slate-200 px-5 py-3 font-black text-slate-500">Abrir estudo — em breve</button>
  </article>;
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
