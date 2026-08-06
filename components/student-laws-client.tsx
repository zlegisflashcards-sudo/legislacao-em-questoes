"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { filterStudentLaws, studentLawShortNameForDisplay, type StudentLaw } from "@/lib/student-laws";
import { supabase } from "@/lib/supabase";

type StudentLawsResponse = { leis?: StudentLaw[]; total?: number; message?: string };
type ActiveTab = "leis" | "edital";

async function studentRequest() {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) return new Response(null, { status: 401 });
  return fetch("/api/aluno/minhas-leis", {
    cache: "no-store",
    headers: { Authorization: `Bearer ${token}` },
  });
}

export function StudentLawsClient() {
  const [activeTab, setActiveTab] = useState<ActiveTab>("leis");
  const [laws, setLaws] = useState<StudentLaw[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    async function load() {
      try {
        const response = await studentRequest();
        if (response.status === 401) {
          window.location.replace("/conta?modo=login&retorno=%2Fminhas-leis");
          return;
        }
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
      <AnkiModule />

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

function AnkiModule() {
  return <aside aria-labelledby="anki-module-title" className="rounded-3xl border border-blue-200 bg-gradient-to-br from-[#062a5f] to-blue-700 p-6 text-white shadow-sm sm:p-8">
    <p className="text-xs font-black uppercase tracking-[0.16em] text-blue-200">Ferramenta de revisão</p>
    <h2 id="anki-module-title" className="mt-2 text-2xl font-black">Anki</h2>
    <p className="mt-3 max-w-2xl text-blue-50">Existe um único deck oficial, completo e atualizado. Quando houver uma nova versão, exclua o deck antigo e importe o novo: isso evita duplicidades, mas reinicia o progresso no Anki. Não há atualização incremental.</p>
    <a href="https://apps.ankiweb.net/" target="_blank" rel="noreferrer" className="mt-5 inline-flex min-h-11 items-center justify-center rounded-xl bg-white px-5 py-3 font-black text-blue-800 transition hover:bg-blue-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white">Conhecer o Anki</a>
  </aside>;
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
