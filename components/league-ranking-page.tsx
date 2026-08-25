"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import type { LeagueRankingData } from "@/lib/league-ranking-server";

const medal = (position: number) => position === 1 ? "🥇" : position === 2 ? "🥈" : position === 3 ? "🥉" : `${position}º`;

export function LeagueRankingPage({ initial }: { initial: LeagueRankingData }) {
  const [data, setData] = useState(initial);
  const [authenticated, setAuthenticated] = useState(false);

  useEffect(() => {
    let live = true;
    void (async () => {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      if (!live || !token) return;
      setAuthenticated(true);
      const response = await fetch(`/api/liga/${encodeURIComponent(initial.league.slug)}`, { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" });
      if (!response.ok) return;
      const next = await response.json() as LeagueRankingData;
      if (live) setData(next);
    })();
    return () => { live = false; };
  }, [initial.league.slug]);

  return <main className="min-h-screen bg-[#020817] px-4 py-10 text-slate-100 sm:px-6 lg:py-16">
    <div className="mx-auto max-w-5xl">
      <section className="relative overflow-hidden rounded-[2rem] border border-cyan-300/35 bg-[radial-gradient(circle_at_15%_15%,rgba(14,165,233,.3),transparent_34%),radial-gradient(circle_at_85%_80%,rgba(245,158,11,.18),transparent_28%),linear-gradient(135deg,#071b3d,#031126_58%,#080c1d)] px-6 py-10 shadow-[0_0_70px_rgba(14,165,233,.16)] sm:px-10 sm:py-14">
        <div aria-hidden="true" className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-cyan-200 to-transparent" />
        <p className="text-xs font-black tracking-[.35em] text-cyan-300">LIGA PMMA</p>
        <h1 className="mt-3 max-w-3xl text-4xl font-black tracking-tight text-white sm:text-6xl">RANKING GERAL<br className="hidden sm:block" /> DE LEGISLAÇÃO</h1>
        <p className="mt-5 max-w-xl text-base leading-relaxed text-slate-300 sm:text-lg">Some seus melhores scores nas leis do edital e suba no ranking.</p>
        <div className="mt-8 inline-flex items-center gap-2 rounded-full border border-amber-300/55 bg-amber-300/10 px-4 py-2 text-sm font-black text-amber-200">⚡ Placar oficial da PMMA</div>
      </section>

      <section className="mt-6 rounded-[2rem] border border-cyan-300/30 bg-[#071329] p-4 shadow-[0_0_42px_rgba(6,182,212,.1)] sm:mt-8 sm:p-7">
        <div className="flex flex-wrap items-end justify-between gap-3 border-b border-cyan-200/20 pb-5">
          <div><p className="font-mono text-xs font-black tracking-[.3em] text-cyan-300">HIGH SCORES</p><h2 className="mt-1 text-xl font-black text-white sm:text-2xl">{data.league.name}</h2></div>
          <span className="text-xs font-bold text-slate-400">Melhores resultados por lei</span>
        </div>
        <div className="mt-3 grid grid-cols-[3.8rem_minmax(0,1fr)_auto] gap-2 px-3 py-2 text-[11px] font-black tracking-wider text-cyan-200/70 sm:grid-cols-[5rem_minmax(0,1fr)_9rem] sm:px-5"><span>POS.</span><span>JOGADOR</span><span className="text-right">SCORE</span></div>
        {data.ranking.length ? <ol className="space-y-2">{data.ranking.map((entry) => <li key={entry.position} className={`grid grid-cols-[3.8rem_minmax(0,1fr)_auto] items-center gap-2 rounded-xl border px-3 py-3 sm:grid-cols-[5rem_minmax(0,1fr)_9rem] sm:px-5 sm:py-4 ${entry.position <= 3 ? "border-amber-300/45 bg-amber-300/10" : "border-cyan-200/10 bg-slate-950/35"}`}><strong className={`font-mono text-base sm:text-lg ${entry.position === 1 ? "text-amber-300" : entry.position === 2 ? "text-slate-200" : entry.position === 3 ? "text-orange-300" : "text-cyan-200"}`}>{medal(entry.position)}</strong><span className="truncate font-bold text-slate-100">{entry.publicName}</span><strong className="text-right font-mono text-base text-cyan-300 sm:text-xl">{entry.score.toLocaleString("pt-BR")}</strong></li>)}</ol> : <p className="py-12 text-center text-sm font-medium text-slate-400">Ainda não há participantes no ranking da Liga PMMA.</p>}
      </section>

      {authenticated ? <section className="mt-6 rounded-3xl border border-amber-300/35 bg-[#111827] p-5 sm:p-7">{data.personal ? <div className="grid gap-4 sm:grid-cols-2"><div><p className="text-xs font-black tracking-[.2em] text-amber-200">SUA POSIÇÃO</p><strong className="mt-1 block font-mono text-4xl text-white">#{data.personal.position}</strong></div><div><p className="text-xs font-black tracking-[.2em] text-amber-200">SEU SCORE</p><strong className="mt-1 block font-mono text-4xl text-cyan-300">{data.personal.score.toLocaleString("pt-BR")}</strong></div></div> : <div><p className="font-black text-white">Você ainda não entrou no ranking da Liga PMMA.</p><Link href="/minhas-leis" className="mt-3 inline-flex text-sm font-bold text-cyan-300 underline underline-offset-4">Estudar as leis do edital →</Link></div>}</section> : <p className="mt-6 text-center text-sm text-slate-400">Já estuda conosco? <Link className="font-bold text-cyan-300 underline underline-offset-4" href="/conta?modo=login&retorno=/liga/pmma">Entre para ver sua posição.</Link></p>}
    </div>
  </main>;
}
