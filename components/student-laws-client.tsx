"use client";

import Link from "next/link";
import Image from "next/image";
import { useCallback, useEffect, useMemo, useState } from "react";
import { StudentAreaTabs, type StudentAreaTabId } from "@/components/student-area-tabs";
import { filterStudentLaws, type StudentLaw } from "@/lib/student-laws";
import { supabase } from "@/lib/supabase";
import type { StudentExam } from "@/lib/student-exams";

type StudentLawsResponse = { leis?: StudentLaw[]; total?: number; message?: string };

async function studentRequest() {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  const userId = data.session?.user.id ?? null;
  if (!token || !userId) return { response: new Response(null, { status: 401 }), userId: null, token: null };
  return {
    response: await fetch("/api/aluno/minhas-leis", {
      cache: "no-store",
      headers: { Authorization: `Bearer ${token}` },
    }),
    userId,
    token,
  };
}

export function StudentLawsClient() {
  const [activeTab, setActiveTab] = useState<StudentAreaTabId>("leis");
  const [laws, setLaws] = useState<StudentLaw[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [myExamLawIds, setMyExamLawIds] = useState<number[]>([]);
  const [hasCustomExam, setHasCustomExam] = useState(false);
  const [examFeedback, setExamFeedback] = useState("");
  const [examSavingLawId, setExamSavingLawId] = useState<number | null>(null);

  useEffect(() => {
    let active = true;
    async function load() {
      try {
        const { response, token } = await studentRequest();
        if (response.status === 401) {
          window.location.replace("/conta?modo=login&retorno=%2Fminhas-leis");
          return;
        }
        const result = await response.json() as StudentLawsResponse;
        if (!response.ok || !Array.isArray(result.leis)) throw new Error(result.message);
        if (active) setLaws(result.leis);
        const examsResponse = await fetch("/api/aluno/editais", { cache: "no-store", headers: { Authorization: `Bearer ${token}` } });
        const examsResult = await examsResponse.json() as { editais?: StudentExam[] };
        if (!examsResponse.ok || !Array.isArray(examsResult.editais)) throw new Error();
        const customExam = examsResult.editais.find((exam) => exam.tipo === "personalizado");
        if (active) { setMyExamLawIds(customExam?.leis.map((law) => law.id) ?? []); setHasCustomExam(Boolean(customExam && customExam.id !== "0")); }
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
  const toggleMyExamLaw = useCallback(async (lawId: number) => {
    const included = myExamLawIds.includes(lawId);
    setExamSavingLawId(lawId);
    setExamFeedback("");
    try {
      const { data } = await supabase.auth.getSession();
      const response = await fetch("/api/aluno/editais", { method: "PATCH", headers: { Authorization: `Bearer ${data.session?.access_token ?? ""}`, "Content-Type": "application/json" }, body: JSON.stringify({ action: included ? "remove" : "add", leiId: lawId }) });
      const result = await response.json().catch(() => null) as { message?: string } | null;
      if (!response.ok) throw new Error(result?.message || "Não foi possível atualizar seu edital.");
      setMyExamLawIds((ids) => included ? ids.filter((id) => id !== lawId) : [...ids, lawId]);
      setExamFeedback(included ? "Lei removida do Meu Edital." : "Lei adicionada ao Meu Edital.");
    } catch (toggleError) {
      setExamFeedback(toggleError instanceof Error ? toggleError.message : "Não foi possível atualizar seu edital.");
    } finally { setExamSavingLawId(null); }
  }, [myExamLawIds]);

  return <div className="mx-auto w-full max-w-6xl px-4 py-10 sm:px-6 sm:py-14">
    <header className="mb-8">
      <p className="font-bold text-blue-700">Área do aluno</p>
      <h1 className="mt-1 text-3xl font-black tracking-tight text-[#062a5f] sm:text-4xl">Legis Questões</h1>
      <p className="mt-3 max-w-2xl text-slate-600">Acesse as leis liberadas para sua conta e prepare sua rotina de estudo.</p>
    </header>

    <StudentAreaTabs activeTab={activeTab} onTabChange={setActiveTab} meuEditalHref="/meu-edital" />

    {activeTab === "leis" ? <section id="student-laws-panel" role="tabpanel" aria-label="Legis Questões" className="grid gap-6">
      {!loading && !error && laws.length > 0 ? <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <label htmlFor="student-laws-search" className="text-sm font-black text-slate-800">Pesquisar em Legis Questões</label>
        <input id="student-laws-search" type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Título, código ou nome curto" className="mt-2 min-h-12 w-full rounded-xl border border-slate-300 px-4 text-slate-900 outline-none transition focus:border-blue-600 focus:ring-2 focus:ring-blue-100" />
        <p className="mt-3 text-sm font-semibold text-slate-500" aria-live="polite">{laws.length} {laws.length === 1 ? "lei liberada" : "leis liberadas"}</p>
      </div> : null}
      {examFeedback ? <p role="status" aria-live="polite" className="text-sm font-semibold text-slate-600">{examFeedback}</p> : null}

      {loading ? <div role="status" className="rounded-2xl border border-blue-100 bg-white p-8 text-slate-600 shadow-sm">Carregando suas leis…</div> : null}
      {!loading && error ? <ErrorState message={error} /> : null}
      {!loading && !error && laws.length === 0 ? <EmptyState /> : null}
      {!loading && !error && laws.length > 0 && filteredLaws.length === 0 ? <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm"><h2 className="text-xl font-black text-[#062a5f]">Nenhuma lei encontrada</h2><p className="mt-2 text-slate-600">Tente pesquisar por outro título, código ou nome curto.</p></div> : null}
      {!loading && !error && filteredLaws.length > 0 ? <div className="grid gap-4" aria-label="Leis liberadas">{filteredLaws.map((law) => <StudentLawCard key={law.id} law={law} hasCustomExam={hasCustomExam} inMyExam={myExamLawIds.includes(law.id)} saving={examSavingLawId === law.id} onToggleMyExam={() => void toggleMyExamLaw(law.id)} />)}</div> : null}
    </section> : <section id="student-exam-panel" role="tabpanel" aria-label="Meu edital" className="rounded-3xl border border-blue-100 bg-white p-8 text-center shadow-sm sm:p-12">
      <p className="text-xs font-black uppercase tracking-[0.16em] text-blue-700">Em breve</p>
      <h2 className="mt-3 text-2xl font-black text-[#062a5f]">Meu edital</h2>
      <p className="mx-auto mt-3 max-w-xl text-slate-600">Organize suas leis em um edital personalizado para acompanhar seu estudo.</p>
      <button type="button" disabled className="mt-6 min-h-11 rounded-xl bg-slate-300 px-5 py-3 font-black text-slate-600">Montar meu edital — em breve</button>
    </section>}

  </div>;
}

function StudentLawCard({ law, hasCustomExam, inMyExam, saving, onToggleMyExam }: { law: StudentLaw; hasCustomExam: boolean; inMyExam: boolean; saving: boolean; onToggleMyExam: () => void }) {
  const lawHref = `/estudar/lei/${encodeURIComponent(law.slug)}`;
  const progress = law.campaignStatus === "concluida" ? 100 : Math.max(0, Math.min(100, law.campaignProgress ?? 0));
  return <article className="grid min-w-0 gap-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
    <div className="flex min-w-0 items-center gap-3"><Image src="/icons/flashcards-law.png" alt="" aria-hidden="true" width={44} height={44} className="h-9 w-9 shrink-0 object-contain sm:h-11 sm:w-11" /><div className="min-w-0"><h2 className="break-words text-xl font-black leading-6 text-[#062a5f]">{law.titulo}</h2><p className="mt-2 break-words text-xs font-black uppercase tracking-wide text-blue-700">{law.codigo ?? law.slug}</p></div></div>
    <div className="min-w-0"><div className="h-2 overflow-hidden rounded-full bg-blue-100" aria-label={`${progress}% concluído`}><span className="block h-full rounded-full bg-blue-700" style={{ width: `${progress}%` }} /></div><p className="mt-2 text-sm font-black text-slate-700">{progress}%</p></div>
    <div className="grid gap-3 sm:flex sm:flex-wrap"><Link href={lawHref} className="inline-flex min-h-12 w-full items-center justify-center rounded-xl bg-blue-700 px-5 py-3 text-center font-black text-white transition hover:bg-blue-600 sm:w-auto">Estudar</Link>{hasCustomExam ? <button type="button" disabled={saving} onClick={onToggleMyExam} className="min-h-12 w-full rounded-xl border border-slate-300 px-5 py-3 font-black text-slate-800 hover:bg-slate-50 disabled:opacity-50 sm:w-auto">{saving ? "Atualizando…" : inMyExam ? "Remover do edital" : "Colocar no edital"}</button> : <Link href="/meu-edital" className="inline-flex min-h-12 w-full items-center justify-center rounded-xl border border-slate-300 px-5 py-3 text-center font-black text-slate-800 hover:bg-slate-50 sm:w-auto">Criar meu edital</Link>}</div>
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
