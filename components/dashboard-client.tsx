"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { DashboardData } from "@/lib/dashboard";
import { supabase } from "@/lib/supabase";

type DashboardResponse = { success?: boolean; dashboard?: DashboardData; message?: string };

async function authenticatedRequest(path: string) {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) return new Response(null, { status: 401 });
  return fetch(path, {
    cache: "no-store",
    headers: { Authorization: `Bearer ${token}` },
  });
}

export function DashboardClient() {
  const [dashboard, setDashboard] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
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

  if (loading) return <DashboardFrame><div role="status" className="rounded-2xl border border-blue-100 bg-white p-8 text-slate-600 shadow-sm">Carregando seu painel…</div></DashboardFrame>;
  if (!dashboard) return <DashboardFrame><div role="alert" className="rounded-2xl border border-red-200 bg-white p-8 text-red-700 shadow-sm"><p>{error || "Seu painel está temporariamente indisponível."}</p><button type="button" onClick={() => window.location.reload()} className="mt-4 rounded-xl bg-blue-700 px-5 py-3 font-black text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700">Tentar novamente</button></div></DashboardFrame>;

  return <DashboardFrame nomePublico={dashboard.nomePublico}>
    <section aria-labelledby="student-laws-title" className="rounded-3xl border border-blue-100 bg-white p-6 shadow-[0_18px_55px_rgba(15,23,42,0.08)] sm:p-8">
      <p className="text-xs font-black uppercase tracking-[0.16em] text-blue-700">Área do aluno</p>
      <h2 id="student-laws-title" className="mt-2 text-2xl font-black tracking-tight text-[#062a5f]">Suas leis em um só lugar</h2>
      <p className="mt-3 max-w-2xl leading-relaxed text-slate-600">Acesse os conteúdos liberados para sua conta e continue sua rotina de estudos.</p>
      <Link href="/minhas-leis" className="mt-6 inline-flex min-h-11 items-center justify-center rounded-xl bg-blue-700 px-5 py-3 text-center font-black text-white transition hover:bg-blue-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700">Acessar minhas leis adquiridas</Link>
    </section>

    <aside aria-labelledby="dashboard-coming-soon-title" className="rounded-3xl border border-slate-200 bg-slate-50 p-6 sm:p-8">
      <h2 id="dashboard-coming-soon-title" className="text-lg font-black text-slate-700">Em breve</h2>
      <p className="mt-2 max-w-3xl leading-relaxed text-slate-600">Seu painel de estudos ficará ainda mais completo, com edital personalizado, progresso, sequência de revisões e acompanhamento da sua evolução.</p>
    </aside>
  </DashboardFrame>;
}

function DashboardFrame({ nomePublico, children }: { nomePublico?: string | null; children: React.ReactNode }) {
  return <div className="mx-auto w-full max-w-5xl px-4 py-10 sm:px-6 sm:py-14">
    <div className="mb-8">
      <p className="font-bold text-blue-700">Meu painel</p>
      <h1 className="mt-1 text-3xl font-black tracking-tight text-[#062a5f] sm:text-4xl">{nomePublico ? `Olá, ${nomePublico}` : "Olá"}</h1>
    </div>
    <div className="grid min-w-0 gap-6">{children}</div>
  </div>;
}
