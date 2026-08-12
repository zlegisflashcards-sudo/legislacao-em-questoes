"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { DashboardData, DashboardEdital } from "@/lib/dashboard";
import { supabase } from "@/lib/supabase";

async function request() { const { data } = await supabase.auth.getSession(); return fetch("/api/dashboard", { headers: { Authorization: `Bearer ${data.session?.access_token ?? ""}` } }); }
const plural = (quantity: number, singular: string, pluralForm: string) => `${quantity} ${quantity === 1 ? singular : pluralForm}`;

export function DashboardClient() {
  const [data, setData] = useState<DashboardData | null>(null); const [loading, setLoading] = useState(true); const [error, setError] = useState("");
  useEffect(() => { void (async () => { try { const response = await request(); if (response.status === 401) { window.location.replace("/conta?modo=login&retorno=%2Fdashboard"); return; } const body = await response.json(); if (!response.ok || !body.dashboard) throw new Error(body.message); setData(body.dashboard); } catch (reason) { setError(reason instanceof Error ? reason.message : "Não foi possível carregar seu painel."); } finally { setLoading(false); } })(); }, []);
  if (loading) return <Frame><p>Carregando seu painel…</p></Frame>;
  if (!data) return <Frame><p role="alert">{error}</p></Frame>;
  return <Frame nome={data.nomePublico}>{!data.editalAtivo ? <section className="rounded-3xl border border-blue-100 bg-white p-8 shadow-sm"><h2 className="text-2xl font-black text-[#062a5f]">Monte seu edital de estudo</h2><p className="mt-3 text-slate-600">Crie um edital personalizado com as leis do seu concurso para organizar seus estudos e acompanhar seu progresso.</p><Link href="/meu-edital" className="mt-6 inline-flex min-h-11 items-center rounded-xl bg-blue-700 px-5 font-black text-white">Montar meu edital</Link></section> : <ActiveExam exam={data.editalAtivo} />}</Frame>;
}

function ActiveExam({ exam }: { exam: DashboardEdital }) {
  const empty = exam.leis === 0;
  return <section className="rounded-3xl border border-blue-100 bg-white p-8 shadow-sm"><h2 className="text-2xl font-black text-[#062a5f]">Estou estudando o {exam.nome}</h2><p className="mt-6 text-sm font-bold text-slate-600">Avanço no edital</p><p className="mt-1 text-2xl font-black text-blue-700">{exam.progresso ?? 0}% concluído</p>{empty ? <p className="mt-4 text-sm text-slate-600">0 leis no edital</p> : <><SegmentedBar exam={exam}/><p className="mt-3 flex flex-wrap gap-x-2 gap-y-1 text-sm text-slate-600"><span>{plural(exam.leis, "lei", "leis")}</span><span aria-hidden="true">·</span><span>{plural(exam.estados.revisao, "em revisão", "em revisão")}</span><span aria-hidden="true">·</span><span>{plural(exam.estados.emEstudo, "em estudo", "em estudo")}</span><span aria-hidden="true">·</span><span>{plural(exam.estados.restantes, "restante", "restantes")}</span></p></>}{exam.progresso === 0 && !empty ? <p className="mt-4 text-slate-600">Seu edital está pronto! Acesse-o e conclua o primeiro ciclo de questões de uma lei para começar a acompanhar seu progresso.</p> : null}<p className="mt-5 text-sm italic text-slate-500">No Anki, a constância vale mais que a pressa. Revise hoje e avance um pouco mais.</p><Link href={exam.url} className="mt-5 inline-flex min-h-10 items-center font-bold text-blue-700 underline underline-offset-4">Ver edital →</Link></section>;
}

function SegmentedBar({ exam }: { exam: DashboardEdital }) { const width = (count: number) => `${(count / exam.leis) * 100}%`; return <div aria-label={`${exam.estados.revisao} em revisão, ${exam.estados.emEstudo} em estudo e ${exam.estados.restantes} restantes`} className="mt-5 flex h-3 w-full overflow-hidden rounded-full bg-slate-100"><span className="bg-emerald-500" style={{ width: width(exam.estados.revisao) }} /><span className="bg-blue-500" style={{ width: width(exam.estados.emEstudo) }} /><span className="bg-slate-300" style={{ width: width(exam.estados.restantes) }} /></div>; }
function Frame({ nome, children }: { nome?: string | null; children: React.ReactNode }) { return <main className="mx-auto w-full max-w-5xl px-4 py-10 sm:px-6 sm:py-14"><p className="font-bold text-blue-700">Meu painel</p><h1 className="mt-1 text-3xl font-black text-[#062a5f]">{nome ? `Olá, ${nome}` : "Olá"}</h1><div className="mt-8">{children}</div></main>; }
