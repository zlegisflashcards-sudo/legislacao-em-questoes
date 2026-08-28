"use client";

import Link from "next/link";
import Image from "next/image";
import { type FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { StudentAreaTabs } from "@/components/student-area-tabs";
import { LawSearchSelect } from "@/components/law-search-select";
import type { StudentExam } from "@/lib/student-exams";
import type { StudentLaw } from "@/lib/student-laws";
import { supabase } from "@/lib/supabase";

async function api(init?: RequestInit) {
  const { data } = await supabase.auth.getSession();
  return fetch("/api/aluno/editais", { ...init, headers: { Authorization: `Bearer ${data.session?.access_token ?? ""}`, "Content-Type": "application/json", ...init?.headers } });
}

function preferredExamId(editais: StudentExam[]) {
  const personalized = editais.find((exam) => exam.tipo === "personalizado");
  const product = editais.find((exam) => exam.tipo === "produto");
  return personalized && personalized.id !== "0" && personalized.leis.length > 0 ? personalized.id : product?.id ?? personalized?.id ?? "";
}

export function StudentExamClient() {
  const [editais, setEditais] = useState<StudentExam[]>([]);
  const [availableLaws, setAvailableLaws] = useState<StudentLaw[]>([]);
  const [selected, setSelected] = useState("");
  const [name, setName] = useState("");
  const [lawToAdd, setLawToAdd] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async (preferCustom = false) => {
    setLoading(true); setError("");
    try {
      const { data } = await supabase.auth.getSession();
      const headers = { Authorization: `Bearer ${data.session?.access_token ?? ""}` };
      const [editaisResponse, lawsResponse] = await Promise.all([api(), fetch("/api/aluno/minhas-leis", { cache: "no-store", headers })]);
      if (editaisResponse.status === 401 || lawsResponse.status === 401) { window.location.replace("/conta?modo=login&retorno=%2Fmeu-edital"); return; }
      const [body, lawsBody] = await Promise.all([editaisResponse.json(), lawsResponse.json()]);
      if (!editaisResponse.ok || !Array.isArray(body.editais)) throw new Error(body.message);
      if (!lawsResponse.ok || !Array.isArray(lawsBody.leis)) throw new Error(lawsBody.message);
      setEditais(body.editais); setAvailableLaws(lawsBody.leis);
      setSelected((current) => {
        if (body.editais.some((exam: StudentExam) => exam.id === current)) return current;
        if (preferCustom) return body.editais.find((exam: StudentExam) => exam.tipo === "personalizado" && exam.id !== "0")?.id ?? preferredExamId(body.editais);
        return preferredExamId(body.editais);
      });
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Não foi possível carregar seus editais."); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);
  const current = editais.find((exam) => exam.id === selected) ?? null;
  const isPersonalized = current?.tipo === "personalizado";
  const customExists = isPersonalized && current.id !== "0";
  const completed = current?.leis.filter((law) => law.campaignStatus === "concluida").length ?? 0;
  const total = current?.leis.length ?? 0;
  const percent = total ? Math.round(completed / total * 100) : 0;
  const selectableLaws = useMemo(() => availableLaws.filter((law) => !current?.leis.some((item) => item.id === law.id)), [availableLaws, current]);

  useEffect(() => { setName(isPersonalized ? current?.nome ?? "" : ""); setLawToAdd(""); }, [current?.id, current?.nome, isPersonalized]);

  async function change(action: string, payload: Record<string, unknown>) {
    setSaving(true); setError("");
    try { const response = await api({ method: "PATCH", body: JSON.stringify({ action, ...payload }) }); if (!response.ok) { const body = await response.json().catch(() => null); throw new Error(body?.message || "Não foi possível atualizar o edital."); } await load(action === "rename"); }
    catch (caught) { setError(caught instanceof Error ? caught.message : "Não foi possível atualizar o edital."); }
    finally { setSaving(false); }
  }
  async function saveName(event: FormEvent<HTMLFormElement>) { event.preventDefault(); const normalized = name.trim(); if (!normalized) { setError("Informe um nome para o edital."); return; } await change("rename", { nome: normalized }); }
  async function addLaw(event: FormEvent<HTMLFormElement>) { event.preventDefault(); const lawId = Number(lawToAdd); if (Number.isSafeInteger(lawId) && lawId > 0) await change("add", { leiId: lawId }); }
  async function move(index: number, direction: number) { if (!current || !isPersonalized) return; const ids = current.leis.map((law) => law.id); const target = index + direction; if (target < 0 || target >= ids.length) return; [ids[index], ids[target]] = [ids[target], ids[index]]; await change("reorder", { leiIds: ids }); }

  return <main className="mx-auto w-full max-w-4xl overflow-x-hidden px-4 py-8 sm:px-6 sm:py-10">
    <header><h1 className="text-3xl font-black tracking-tight text-[#062a5f] sm:text-4xl">Meus Editais</h1></header>
    <StudentAreaTabs activeTab="edital" minhasLeisHref="/minhas-leis" meuEditalHref="/meu-edital" />
    {loading ? <p className="border-b border-slate-200 py-5 text-slate-600">Carregando seus editais…</p> : null}
    {error ? <p role="alert" className="mt-5 border-b border-red-200 py-4 text-red-700">{error}</p> : null}
    {!loading && !error ? <>
      <nav aria-label="Selecionar edital" className="mt-6 flex max-w-full gap-2 overflow-x-auto border-b border-slate-200 pb-3">
        {editais.filter((exam) => exam.tipo === "produto" || exam.id !== "0").map((exam) => <button key={`${exam.tipo}-${exam.id}`} type="button" onClick={() => setSelected(exam.id)} aria-pressed={selected === exam.id} className={selected === exam.id ? "min-h-10 shrink-0 rounded-full bg-blue-700 px-4 text-sm font-black text-white" : "min-h-10 shrink-0 rounded-full border border-slate-300 px-4 text-sm font-bold text-slate-700 hover:border-blue-300 hover:text-blue-700"}>{exam.nome}</button>)}
        {editais.some((exam) => exam.tipo === "personalizado" && exam.id === "0") ? <button type="button" onClick={() => setSelected("0")} aria-pressed={selected === "0"} className={selected === "0" ? "min-h-10 shrink-0 rounded-full bg-blue-700 px-4 text-sm font-black text-white" : "min-h-10 shrink-0 rounded-full border border-slate-300 px-4 text-sm font-bold text-slate-700 hover:border-blue-300 hover:text-blue-700"}>Criar meu edital</button> : null}
      </nav>
      {!current ? <p className="mt-6 border-b border-slate-200 pb-7 text-slate-600">Você ainda não possui editais disponíveis.</p> : null}
      {current && isPersonalized && !customExists ? <section className="mt-6 max-w-lg border-b border-slate-200 pb-6"><h2 className="text-xl font-black text-[#062a5f]">Criar meu edital</h2><p className="mt-2 text-sm text-slate-600">Escolha um nome para organizar as leis que você já possui.</p><form onSubmit={(event) => void saveName(event)} className="mt-4 flex flex-col gap-3 sm:flex-row"><input value={name} onChange={(event) => setName(event.target.value)} maxLength={80} required placeholder="Ex.: PRF 2026" className="min-h-11 min-w-0 flex-1 rounded-lg border border-slate-300 px-3" /><button disabled={saving} className="min-h-11 rounded-lg bg-blue-700 px-4 font-black text-white disabled:opacity-50">Criar meu edital</button></form></section> : null}
      {current && (current.tipo === "produto" || customExists) ? <section className="mt-6 min-w-0" aria-labelledby="exam-laws-title">
        <div className="border-b border-slate-200 pb-5"><div className="flex min-w-0 items-center gap-3"><h2 id="exam-laws-title" className="min-w-0 flex-1 truncate text-lg font-black text-[#062a5f]">{current.nome}</h2>{isPersonalized ? <form onSubmit={(event) => void saveName(event)} className="flex min-w-0 shrink items-center gap-2"><label className="sr-only" htmlFor="exam-name">Nome do edital</label><input id="exam-name" value={name} onChange={(event) => setName(event.target.value)} maxLength={80} required className="min-h-9 min-w-0 w-28 rounded border border-slate-300 px-2 text-sm sm:w-44" /><button disabled={saving || name.trim() === current.nome} className="min-h-9 shrink-0 text-sm font-bold text-blue-700 disabled:text-slate-400">Salvar</button></form> : null}</div>
          <div className="mt-4 flex min-w-0 items-center gap-3"><span className="shrink-0 text-sm font-black uppercase tracking-wide text-slate-700">Progresso geral</span><div className="h-2 min-w-0 flex-1 overflow-hidden rounded-full bg-slate-200"><span className="block h-full rounded-full bg-blue-700" style={{ width: `${percent}%` }} /></div><strong className="shrink-0 text-sm text-[#062a5f]">{percent}%</strong></div><p className="mt-2 text-sm text-slate-500">{completed} de {total} leis concluídas</p>
          {isPersonalized ? <form onSubmit={(event) => void addLaw(event)} className="mt-4 flex min-w-0 flex-col gap-2 sm:flex-row"><label className="sr-only" htmlFor="exam-law">Adicionar lei ao edital</label><LawSearchSelect name="exam-law" value={lawToAdd} onChange={setLawToAdd} options={selectableLaws} emptyLabel="Adicionar lei ao edital" placeholder="Pesquisar lei para adicionar…" className="flex-1" /><button disabled={saving || !lawToAdd} className="min-h-11 rounded-lg border border-blue-700 px-4 font-black text-blue-700 disabled:border-slate-300 disabled:text-slate-400">+ Adicionar ao edital</button></form> : null}
        </div>
        {current.leis.length === 0 ? <p className="border-b border-slate-200 py-5 text-sm text-slate-600">{isPersonalized ? "Adicione leis liberadas para montar seu edital." : "Este edital ainda não possui leis."}</p> : <ol className="mt-3 border-t border-slate-200">{current.leis.map((law, index) => {
          const concluded = law.campaignStatus === "concluida"; const label = law.titulo.trim() || `Lei ${law.id}`;
          return <li key={law.id} className={`grid min-w-0 ${isPersonalized ? "grid-cols-[auto_minmax(0,1fr)_auto]" : "grid-cols-[minmax(0,1fr)_auto]"} items-start gap-2 border-b border-slate-200 py-2.5 sm:gap-3`}>
            {isPersonalized ? <span className="flex shrink-0 items-center gap-1" aria-label="Reordenar lei"><button type="button" disabled={saving || index === 0} onClick={() => void move(index, -1)} aria-label={`Mover ${label} para cima`} className="grid h-9 w-9 place-items-center rounded text-base font-black text-blue-700 hover:bg-blue-50 disabled:cursor-not-allowed disabled:text-slate-300 disabled:hover:bg-transparent">↑</button><button type="button" disabled={saving || index === current.leis.length - 1} onClick={() => void move(index, 1)} aria-label={`Mover ${label} para baixo`} className="grid h-9 w-9 place-items-center rounded text-base font-black text-blue-700 hover:bg-blue-50 disabled:cursor-not-allowed disabled:text-slate-300 disabled:hover:bg-transparent">↓</button></span> : null}
            <span className="flex min-w-0 items-start gap-3"><Image src="/icons/flashcards-law.png" alt="" aria-hidden="true" width={36} height={36} className="mt-1 h-8 w-8 shrink-0 object-contain sm:h-9 sm:w-9" /><span className="min-w-0"><Link href={`/estudar/lei/${encodeURIComponent(law.slug)}`} className="block min-w-0 break-words py-1 text-sm font-semibold leading-5 text-[#062a5f] underline decoration-blue-200 underline-offset-4 hover:text-blue-700">{label}</Link><span className="block break-words text-[11px] font-black uppercase tracking-wide text-blue-700">{law.slug}</span>{isPersonalized ? <span className="mt-1 flex flex-wrap items-center gap-2"><span className="text-xs font-black text-emerald-700">✓ No edital</span><button type="button" disabled={saving} onClick={() => void change("remove", { leiId: law.id })} aria-label={`Remover ${label} do edital`} className="min-h-8 text-xs font-bold text-slate-500 underline underline-offset-2 hover:text-red-700 disabled:text-slate-300">Remover do edital</button></span> : null}</span></span>
            <span aria-label={concluded ? "Lei concluída" : "Lei ainda não concluída"} className={concluded ? "grid h-6 w-6 shrink-0 self-start place-items-center rounded-full bg-blue-700 text-xs text-white" : "shrink-0 self-start text-2xl leading-none text-slate-400"}>{concluded ? "⚡" : "○"}</span>
          </li>;
        })}</ol>}
      </section> : null}
    </> : null}
  </main>;
}
