"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { StudentAreaTabs } from "@/components/student-area-tabs";
import { nextExamLawProgress, type StudentExam } from "@/lib/student-exams";
import { supabase } from "@/lib/supabase";

type ActiveExam = { id: string; tipo: StudentExam["tipo"] } | null;

async function api(init?: RequestInit) {
  const { data } = await supabase.auth.getSession();
  return fetch("/api/aluno/editais", {
    ...init,
    headers: { Authorization: `Bearer ${data.session?.access_token ?? ""}`, "Content-Type": "application/json", ...init?.headers },
  });
}

function normalizeText(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
}

export function StudentExamClient() {
  const [editais, setEditais] = useState<StudentExam[]>([]);
  const [selected, setSelected] = useState("");
  const [active, setActive] = useState<ActiveExam>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState(false);
  const [progressSavingLawId, setProgressSavingLawId] = useState<number | null>(null);
  const [name, setName] = useState("");
  const [search, setSearch] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await api();
      if (response.status === 401) {
        window.location.replace("/conta?modo=login&retorno=%2Fmeu-edital");
        return;
      }
      const body = await response.json();
      if (!response.ok || !Array.isArray(body.editais)) throw new Error();
      setEditais(body.editais);
      setActive(body.editalAtivo?.id ? body.editalAtivo : null);
      setSelected((current: string) => body.editais.some((exam: StudentExam) => exam.id === current) ? current : "");
    } catch {
      setError("Não foi possível carregar seus editais. Tente novamente em instantes.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const current = editais.find((exam) => exam.id === selected) ?? null;
  const filteredEditais = useMemo(() => editais.filter((exam) => normalizeText(exam.nome).includes(normalizeText(search))), [editais, search]);

  async function change(action: string, payload: Record<string, unknown>) {
    const response = await api({ method: "PATCH", body: JSON.stringify({ action, ...payload }) });
    if (!response.ok) {
      const body = await response.json().catch(() => null);
      throw new Error(body?.message || "Não foi possível salvar o edital.");
    }
    await load();
  }

  async function makeActive(id: string) {
    const exam = editais.find((item) => item.id === id);
    if (!exam) return;
    try {
      await change("set-active", { id: exam.id, tipo: exam.tipo });
      setActive({ id: exam.id, tipo: exam.tipo });
      setSelected(exam.id);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Não foi possível salvar o edital em estudo.");
    }
  }

  async function updateLawProgress(law: StudentExam["leis"][number], control: "study" | "review") {
    if (control === "study" && law.revisao) {
      setError("Retire a lei da Revisão antes de desmarcar Estudando.");
      return;
    }
    const next = nextExamLawProgress(law, control);
    if (!next) return;
    setProgressSavingLawId(law.id);
    setError("");
    try {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (!token) {
        window.location.replace(`/conta?modo=login&retorno=${encodeURIComponent("/meu-edital")}`);
        return;
      }
      const response = await fetch(`/api/aluno/estudar/lei/${encodeURIComponent(law.slug)}/progresso`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify(next),
      });
      const body = await response.json() as { progress?: { inStudy: boolean; questionsFinished: boolean }; message?: string };
      if (!response.ok || !body.progress) throw new Error(body.message || "Não foi possível salvar o progresso.");
      setEditais((items) => items.map((exam) => ({
        ...exam,
        leis: exam.leis.map((item) => item.id === law.id
          ? { ...item, emEstudo: body.progress!.inStudy, revisao: body.progress!.questionsFinished }
          : item),
      })));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Não foi possível salvar o progresso.");
    } finally {
      setProgressSavingLawId(null);
    }
  }

  async function move(index: number, direction: number) {
    if (!current || current.tipo !== "personalizado") return;
    const laws = [...current.leis];
    const target = index + direction;
    if (target < 0 || target >= laws.length) return;
    [laws[index], laws[target]] = [laws[target], laws[index]];
    try {
      await change("reorder", { leiIds: laws.map((law) => law.id) });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Não foi possível ordenar o edital.");
    }
  }

  return <main className="mx-auto w-full max-w-6xl overflow-x-hidden px-4 py-10 sm:px-6 sm:py-14">
    <header className="mb-8">
      <p className="font-bold text-blue-700">Área do aluno</p>
      <div className="mt-1 flex flex-wrap items-center gap-3">
        <h1 className="text-3xl font-black tracking-tight text-[#062a5f] sm:text-4xl">{current?.nome ?? "Meus editais"}</h1>
        {current?.tipo === "personalizado" && !editing ? <button type="button" onClick={() => { setName(current.nome); setEditing(true); }} className="rounded-lg px-2 py-1 text-sm font-bold text-blue-700 underline underline-offset-4">Editar nome</button> : null}
      </div>
      {editing ? <div className="mt-3 flex flex-wrap gap-2">
        <input aria-label="Nome do edital" maxLength={80} value={name} onChange={(event) => setName(event.target.value)} className="min-h-11 min-w-0 flex-1 rounded-xl border border-slate-300 px-3"/>
        <button type="button" onClick={() => void change("rename", { nome: name }).then(() => setEditing(false)).catch((reason) => setError(reason.message))} className="min-h-11 rounded-xl bg-blue-700 px-4 font-black text-white">Salvar</button>
        <button type="button" onClick={() => setEditing(false)} className="min-h-11 px-3 font-bold">Cancelar</button>
      </div> : <p className="mt-3 text-slate-600">Organize suas leis e acompanhe seu estudo.</p>}
    </header>

    <StudentAreaTabs activeTab="edital" minhasLeisHref="/minhas-leis" meuEditalHref="/meu-edital"/>

    {!loading && editais.length > 0 ? <section className="mb-6 w-full max-w-2xl rounded-2xl border border-blue-100 bg-white p-4 shadow-sm">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <label className="text-sm font-black text-slate-700" htmlFor="exam-search">Pesquisar editais</label>
          <input id="exam-search" type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Pesquisar meus editais..." className="mt-2 min-h-11 w-full rounded-xl border border-slate-300 px-3 text-sm outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-100 sm:min-w-[18rem]" />
        </div>
        {current ? <button type="button" onClick={() => setSelected("")} className="min-h-11 rounded-xl border border-blue-200 px-4 font-black text-blue-700">Trocar edital</button> : null}
      </div>
      <p className="mt-3 text-sm text-slate-600">{current ? `Edital selecionado: ${current.nome}` : "Escolha um edital para visualizar suas leis."}</p>
    </section> : null}

    {!loading && !current && editais.length > 0 ? <nav aria-label="Visualizar edital" className="mb-6 grid gap-2">
      {filteredEditais.length > 0 ? filteredEditais.map((exam) => <button key={exam.id} type="button" onClick={() => setSelected(exam.id)} className="min-h-12 w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-left font-black text-[#062a5f] shadow-sm transition hover:border-blue-200 hover:bg-blue-50">{exam.nome}</button>) : <p className="rounded-2xl border border-slate-200 bg-white p-4 text-slate-600">Nenhum edital encontrado.</p>}
    </nav> : null}

    {loading ? <div role="status" className="rounded-2xl border border-blue-100 bg-white p-8">Carregando seus editais…</div> : null}
    {!loading && error ? <div role="alert" className="rounded-2xl border border-red-200 bg-white p-6 text-red-700">{error}</div> : null}
    {!loading && !error && current?.leis.length === 0 ? <section className="rounded-3xl border border-blue-100 bg-white p-6 text-center shadow-sm sm:p-8">
      <h2 className="text-2xl font-black text-[#062a5f]">Monte seu edital</h2>
      <p className="mt-3 text-slate-600">Adicione leis pela página Minhas Leis e organize aqui na ordem em que deseja estudá-las.</p>
      <Link href="/minhas-leis" className="mt-6 inline-flex min-h-11 items-center justify-center rounded-xl bg-blue-700 px-5 py-3 font-black text-white">Ir para Minhas Leis</Link>
    </section> : null}
    {!loading && !error && current && current.leis.length > 0 ? <ol className="divide-y divide-slate-200 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      {current.leis.map((law, index) => <li key={law.id} className="grid gap-4 p-4 sm:grid-cols-[auto_minmax(0,1fr)_auto_auto_auto] sm:items-center sm:gap-4">
        <span className="hidden font-black text-slate-500 sm:block">{index + 1}.</span>
        <div className="min-w-0 sm:contents">
          <Link href={`/estudar/lei/${encodeURIComponent(law.slug)}`} className="col-span-2 min-w-0 break-words text-balance text-xl font-black leading-tight text-[#062a5f] underline decoration-blue-200 underline-offset-4 hover:text-blue-700 sm:col-span-1 sm:text-base sm:font-bold">{law.titulo}</Link>
          <div className="flex flex-wrap items-center gap-2 pt-2 sm:contents sm:pt-0">
            <ProgressControl label="Estudando" checked={law.emEstudo} disabled={progressSavingLawId === law.id} onClick={() => void updateLawProgress(law, "study")} />
            <ProgressControl label="Revisão" checked={law.revisao} disabled={progressSavingLawId === law.id} onClick={() => void updateLawProgress(law, "review")} />
          </div>
        </div>
        {current.tipo === "personalizado" ? <span className="col-span-2 flex flex-wrap gap-1 sm:col-span-1 sm:justify-end">
          <button type="button" aria-label={`Subir ${law.titulo}`} disabled={index === 0} onClick={() => void move(index, -1)} className="min-h-10 px-2 font-black text-blue-700 disabled:text-slate-300">↑</button>
          <button type="button" aria-label={`Descer ${law.titulo}`} disabled={index === current.leis.length - 1} onClick={() => void move(index, 1)} className="min-h-10 px-2 font-black text-blue-700 disabled:text-slate-300">↓</button>
          <button type="button" onClick={() => void change("remove", { leiId: law.id }).catch((reason) => setError(reason.message))} className="min-h-10 px-2 text-sm font-bold text-red-700">Remover</button>
        </span> : null}
      </li>)}
    </ol> : null}
  </main>;
}

function ProgressControl({ label, checked, disabled, onClick }: { label: string; checked: boolean; disabled: boolean; onClick: () => void }) {
  return <button type="button" aria-pressed={checked} aria-label={`${label} ${checked ? "concluído" : "não concluído"}`} disabled={disabled} onClick={onClick} className={`inline-flex min-h-11 min-w-0 items-center gap-2 rounded-xl border px-3 py-2 text-sm font-bold transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700 sm:px-3.5 ${checked ? "border-blue-200 bg-blue-50 text-slate-700" : "border-slate-200 bg-white text-slate-500 hover:bg-slate-50"}`}>
    <span aria-hidden="true" className={`inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md border-2 ${checked ? "border-blue-600 bg-blue-100" : "border-slate-300 bg-slate-50"}`}>
      {checked ? <span className="text-sm leading-none text-blue-800">✓</span> : null}
    </span>
    <span>{label}</span>
  </button>;
}
