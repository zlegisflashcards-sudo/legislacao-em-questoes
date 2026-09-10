"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { leaguePagePresentation, leagueProductHref } from "@/lib/league-page-config";
import type { LeagueRankingData } from "@/lib/league-ranking-server";

/** Compatibilidade para o consumidor legado de /api/liga. Não é usado por Records. */
export function LeagueRankingPage({ initial }: { initial: LeagueRankingData }) {
  const [data, setData] = useState(initial);
  const config = leaguePagePresentation(data.league);

  useEffect(() => { let live = true; void (async () => { const { data: sessionData } = await supabase.auth.getSession(); const token = sessionData.session?.access_token; if (!token) return; const response = await fetch(`/api/liga/${encodeURIComponent(initial.league.slug)}`, { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" }); if (!response.ok) return; const next = await response.json() as LeagueRankingData; if (live) setData(next); })(); return () => { live = false; }; }, [initial.league.slug]);

  return <main className="min-h-screen bg-[#020817] px-4 py-10 text-slate-100"><div className="mx-auto max-w-5xl"><section className="relative overflow-hidden rounded-[2rem] border border-cyan-300/35 bg-[#031126] px-6 py-10"><div aria-hidden="true" className="absolute inset-0 -z-10 bg-cover bg-center" style={config.heroImage ? { backgroundImage: `url(${config.heroImage})` } : undefined} /><h1 className="text-4xl font-black text-white">{config.heroTitle}</h1><p className="mt-4 text-slate-300">{config.heroSubtitle}</p></section><section className="mt-6 rounded-[2rem] border border-cyan-300/30 bg-[#071329] p-5"><h2 className="text-xl font-black text-white">{data.league.name}</h2><ol className="mt-5 space-y-2">{data.ranking.map((entry) => <li key={entry.position} className="grid grid-cols-[3rem_1fr_auto] gap-3 rounded-xl border border-cyan-200/10 p-3"><strong>{entry.position}º</strong><span>{entry.publicName}</span><strong>{entry.score.toLocaleString("pt-BR")}</strong></li>)}</ol><Link href={leagueProductHref(config)} className="mt-6 inline-flex font-bold text-cyan-300 underline">{config.ctaLabel}</Link></section></div></main>;
}
