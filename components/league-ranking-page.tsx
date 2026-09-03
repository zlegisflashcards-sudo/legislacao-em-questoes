"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { leaguePagePresentation, leagueProductHref } from "@/lib/league-page-config";
import type { LeagueRankingData } from "@/lib/league-ranking-server";

const medal = (position: number) => position === 1 ? "🥇" : position === 2 ? "🥈" : position === 3 ? "🥉" : `${position}º`;

export function LeagueRankingPage({ initial }: { initial: LeagueRankingData }) {
  const [data, setData] = useState(initial);
  const [authenticated, setAuthenticated] = useState(false);
  const config = leaguePagePresentation(data.league);

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
      <section className="relative isolate min-h-[23rem] overflow-hidden rounded-[2rem] border border-cyan-300/35 bg-[#031126] px-6 py-10 shadow-[0_0_70px_rgba(14,165,233,.16)] sm:min-h-[26rem] sm:px-10 sm:py-14">
        {config.heroImage ? <div aria-hidden="true" className="absolute inset-0 -z-20 bg-cover bg-center" style={{ backgroundImage: `url(${config.heroImage})` }} /> : null}
        <div aria-hidden="true" className="absolute inset-0 -z-10 bg-[linear-gradient(90deg,rgba(2,8,23,.98)_0%,rgba(2,8,23,.88)_42%,rgba(2,8,23,.32)_100%)]" />
        <div aria-hidden="true" className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-cyan-200 to-transparent" />
        <div className="flex items-start gap-4 sm:gap-5"><span aria-hidden="true" className="mt-1 inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-amber-300/45 bg-amber-300/10 text-2xl shadow-[0_0_26px_rgba(251,191,36,.18)] sm:h-16 sm:w-16 sm:text-3xl">🏆</span><h1 className="max-w-3xl text-4xl font-black tracking-tight text-white sm:text-6xl">{config.heroTitle}</h1></div>
        <p className="mt-5 max-w-xl text-base leading-relaxed text-slate-300 sm:text-lg">{config.heroSubtitle}</p>
      </section>

      <section className="mt-6 rounded-[2rem] border border-cyan-300/30 bg-[#071329] p-4 shadow-[0_0_42px_rgba(6,182,212,.1)] sm:mt-8 sm:p-7">
        <div className="flex flex-wrap items-end justify-between gap-3 border-b border-cyan-200/20 pb-5">
          <div><p className="font-mono text-xs font-black tracking-[.3em] text-cyan-300">HIGH SCORES</p><h2 className="mt-1 text-xl font-black text-white sm:text-2xl">{data.league.name}</h2></div>
        </div>
        <div className="mt-3 grid grid-cols-[3.8rem_minmax(0,1fr)_auto] gap-2 px-3 py-2 text-[11px] font-black tracking-wider text-cyan-200/70 sm:grid-cols-[5rem_minmax(0,1fr)_9rem] sm:px-5"><span>POS.</span><span>JOGADOR</span><span className="text-right">SCORE</span></div>
        {data.ranking.length ? <ol className="space-y-2">{data.ranking.map((entry) => <li key={entry.position} className={`grid grid-cols-[3.8rem_minmax(0,1fr)_auto] items-center gap-2 rounded-xl border px-3 py-3 sm:grid-cols-[5rem_minmax(0,1fr)_9rem] sm:px-5 sm:py-4 ${entry.position <= 3 ? "border-amber-300/45 bg-amber-300/10" : "border-cyan-200/10 bg-slate-950/35"}`}><strong className={`font-mono text-base sm:text-lg ${entry.position === 1 ? "text-amber-300" : entry.position === 2 ? "text-slate-200" : entry.position === 3 ? "text-orange-300" : "text-cyan-200"}`}>{medal(entry.position)}</strong><span className="truncate font-bold text-slate-100">{entry.publicName}</span><strong className="text-right font-mono text-base text-cyan-300 sm:text-xl">{entry.score.toLocaleString("pt-BR")}</strong></li>)}</ol> : <p className="py-12 text-center text-sm font-medium text-slate-400">Ainda não há participantes no ranking da {data.league.name}.</p>}
        <div className="mt-7 flex justify-center"><Link href={leagueProductHref(config)} className="inline-flex min-h-12 items-center justify-center rounded-xl border border-cyan-200/70 bg-gradient-to-r from-cyan-400 via-sky-400 to-blue-500 px-6 py-3 text-center text-sm font-black text-slate-950 shadow-[0_0_30px_rgba(34,211,238,.32)] transition hover:-translate-y-0.5 hover:shadow-[0_0_38px_rgba(34,211,238,.48)] active:translate-y-0 active:scale-[.99] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-cyan-300 sm:px-8 sm:text-base">{config.ctaLabel}</Link></div>
      </section>

      {authenticated ? <section className="mt-6 rounded-3xl border border-amber-300/35 bg-[#111827] p-5 sm:p-7">{data.personal ? <div className="grid gap-4 sm:grid-cols-2"><div><p className="text-xs font-black tracking-[.2em] text-amber-200">SUA POSIÇÃO</p><strong className="mt-1 block font-mono text-4xl text-white">#{data.personal.position}</strong></div><div><p className="text-xs font-black tracking-[.2em] text-amber-200">SEU SCORE</p><strong className="mt-1 block font-mono text-4xl text-cyan-300">{data.personal.score.toLocaleString("pt-BR")}</strong></div></div> : <div><p className="font-black text-white">Você ainda não entrou no ranking da {data.league.name}.</p><Link href="/minhas-leis" className="mt-3 inline-flex text-sm font-bold text-cyan-300 underline underline-offset-4">Estudar as leis do edital →</Link></div>}</section> : <p className="mt-6 text-center text-sm text-slate-400">Já estuda conosco? <Link className="font-bold text-cyan-300 underline underline-offset-4" href={`/conta?modo=login&retorno=/liga/${encodeURIComponent(data.league.slug)}`}>Entre para ver sua posição.</Link></p>}
    </div>
  </main>;
}
