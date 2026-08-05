"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { dailyGuidance, type DashboardData, type DailyReviewState } from "@/lib/dashboard";
import { supabase } from "@/lib/supabase";

type DashboardResponse = { success?: boolean; dashboard?: DashboardData; revisao?: DailyReviewState; message?: string };

async function authenticatedRequest(path: string, method = "GET") {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) return new Response(null, { status: 401 });
  return fetch(path, {
    method,
    cache: "no-store",
    headers: { Authorization: `Bearer ${token}` },
  });
}

export function DashboardClient() {
  const [dashboard, setDashboard] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [registering, setRegistering] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    async function load() {
      try {
        const response = await authenticatedRequest("/api/dashboard");
        if (response.status === 401) {
          window.location.replace("/conta?modo=login&retorno=%2Fdashboard");
          return;
        }
        const result = await response.json() as DashboardResponse;
        if (!response.ok || !result.dashboard) throw new Error(result.message);
        if (active) setDashboard(result.dashboard);
      } catch {
        if (active) setError("Não foi possível carregar seu painel. Tente novamente em instantes.");
      } finally {
        if (active) setLoading(false);
      }
    }
    void load();
    return () => { active = false; };
  }, []);

  async function markToday() {
    if (!dashboard || dashboard.revisao.hojeConcluida || registering) return;
    setRegistering(true);
    setError("");
    try {
      const response = await authenticatedRequest("/api/dashboard/revisao", "POST");
      if (response.status === 401) {
        window.location.replace("/conta?modo=login&retorno=%2Fdashboard");
        return;
      }
      const result = await response.json() as DashboardResponse;
      if (!response.ok || !result.revisao) throw new Error(result.message);
      setDashboard({ ...dashboard, revisao: result.revisao });
    } catch {
      setError("Não foi possível registrar a revisão de hoje. Tente novamente.");
    } finally {
      setRegistering(false);
    }
  }

  if (loading) return <DashboardFrame><div role="status" className="rounded-2xl border border-blue-100 bg-white p-8 text-slate-600 shadow-sm">Carregando seu painel…</div></DashboardFrame>;
  if (!dashboard) return <DashboardFrame><div role="alert" className="rounded-2xl border border-red-200 bg-white p-8 text-red-700 shadow-sm"><p>{error || "Seu painel está temporariamente indisponível."}</p><button type="button" onClick={() => window.location.reload()} className="mt-4 rounded-xl bg-blue-700 px-5 py-3 font-black text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700">Tentar novamente</button></div></DashboardFrame>;

  const { editalAtivo, revisao } = dashboard;
  return <DashboardFrame nomePublico={dashboard.nomePublico}>
    {error ? <p role="alert" className="mb-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 font-bold text-red-700">{error}</p> : null}

    <section aria-labelledby="edital-title" className="rounded-3xl border border-blue-100 bg-white p-6 shadow-[0_18px_55px_rgba(15,23,42,0.08)] sm:p-8">
      <p className="text-xs font-black uppercase tracking-[0.16em] text-blue-700">Seu plano atual</p>
      <h2 id="edital-title" className="mt-2 text-2xl font-black tracking-tight text-[#062a5f]">Edital em estudo</h2>
      {editalAtivo ? <div className="mt-6">
        <h3 className="text-xl font-bold text-slate-900">{editalAtivo.nome}</h3>
        {editalAtivo.progresso === null ? <p className="mt-3 text-sm text-slate-600">O progresso deste edital ainda não foi informado.</p> : <div className="mt-5">
          <div className="mb-2 flex items-center justify-between gap-4 text-sm font-bold"><span>Progresso geral</span><span>{editalAtivo.progresso}%</span></div>
          <div role="progressbar" aria-label={`Progresso geral de ${editalAtivo.nome}`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={editalAtivo.progresso} className="h-3 overflow-hidden rounded-full bg-blue-100"><div className="h-full rounded-full bg-blue-600 transition-[width]" style={{ width: `${editalAtivo.progresso}%` }} /></div>
        </div>}
        <Link href={editalAtivo.url} className="mt-6 inline-flex min-h-11 items-center justify-center rounded-xl bg-blue-700 px-5 py-3 font-black text-white transition hover:bg-blue-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700">Abrir meu edital</Link>
      </div> : <div className="mt-5 rounded-2xl bg-blue-50 p-5">
        <p className="font-semibold text-slate-700">Você ainda não selecionou um edital para acompanhar.</p>
        <Link href="/vade-mecum" className="mt-4 inline-flex min-h-11 items-center justify-center rounded-xl border border-blue-300 bg-white px-5 py-3 font-black text-blue-700 transition hover:bg-blue-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700">Ver materiais por concurso</Link>
      </div>}
    </section>

    <section aria-labelledby="streak-title" className="rounded-3xl border border-blue-100 bg-white p-6 shadow-sm sm:p-8">
      <h2 id="streak-title" className="text-2xl font-black tracking-tight text-[#062a5f]">Sequência de estudos</h2>
      <p className="mt-4 text-4xl font-black text-blue-700">{revisao.streakAtual} <span className="text-base font-bold text-slate-600">{revisao.streakAtual === 1 ? "dia" : "dias"}</span></p>
      <p className="mt-3 text-slate-600">{revisao.hojeConcluida ? "Revisão de hoje registrada." : "A revisão de hoje ainda não foi registrada."}</p>
      <button type="button" onClick={() => void markToday()} disabled={revisao.hojeConcluida || registering} aria-label={revisao.hojeConcluida ? "Revisão de hoje já registrada" : "Marcar revisão de hoje"} className="mt-6 inline-flex min-h-11 items-center justify-center rounded-xl bg-blue-700 px-5 py-3 font-black text-white transition hover:bg-blue-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700 disabled:cursor-default disabled:bg-emerald-600 disabled:opacity-100">{revisao.hojeConcluida ? "Revisão registrada" : registering ? "Registrando…" : "Marcar revisão de hoje"}</button>
    </section>

    <section aria-labelledby="guidance-title" className="rounded-3xl border border-blue-200 bg-[#eaf3ff] p-6 sm:p-8">
      <h2 id="guidance-title" className="text-lg font-black text-[#062a5f]">Orientação do dia</h2>
      <p className="mt-3 text-lg leading-relaxed text-slate-700" aria-live="polite">{dailyGuidance(revisao.hojeConcluida)}</p>
    </section>
  </DashboardFrame>;
}

function DashboardFrame({ nomePublico, children }: { nomePublico?: string | null; children: React.ReactNode }) {
  return <div className="mx-auto w-full max-w-5xl px-4 py-10 sm:px-6 sm:py-14">
    <div className="mb-8"><p className="font-bold text-blue-700">Meu painel</p><h1 className="mt-1 text-3xl font-black tracking-tight text-[#062a5f] sm:text-4xl">{nomePublico ? `Olá, ${nomePublico}` : "Organize seu estudo"}</h1><p className="mt-3 max-w-2xl text-slate-600">Acompanhe seu edital e registre sua revisão diária manualmente.</p></div>
    <div className="grid min-w-0 gap-6">{children}</div>
  </div>;
}
