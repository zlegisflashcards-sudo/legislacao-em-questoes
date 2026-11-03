"use client";

import Link from "next/link";
import Image from "next/image";
import { type FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { StudentAreaTabs } from "@/components/student-area-tabs";
import { LawSearchSelect } from "@/components/law-search-select";
import type { StudentExam } from "@/lib/student-exams";
import { uniqueStudentLawsById, type StudentLaw } from "@/lib/student-laws";

type EditorResponse = Pick<Response, "ok" | "status" | "json">;
type EditorRequester = (path: string, init?: RequestInit) => Promise<EditorResponse>;
type StudentExamClientProps = {
  embedded?: boolean;
  contained?: boolean;
  requester?: EditorRequester;
  onStudyLawSelect?: (law: StudentExam["leis"][number]) => void;
};

function preferredExamId(editais: StudentExam[]) {
  return editais.find((exam) => exam.tipo === "personalizado")?.id ?? "";
}

export function StudentExamClient({ embedded = false, contained = false, requester, onStudyLawSelect }: StudentExamClientProps) {
  const [editais, setEditais] = useState<StudentExam[]>([]);
  const [availableLaws, setAvailableLaws] = useState<StudentLaw[]>([]);
  const [availableLawsLoading, setAvailableLawsLoading] = useState(false);
  const [selected, setSelected] = useState("");
  const [name, setName] = useState("");
  const [lawToAdd, setLawToAdd] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const request = useCallback<EditorRequester>(async (path, init) => {
    if (requester) return requester(path, init);
    const { supabase } = await import("@/lib/supabase");
    const { data } = await supabase.auth.getSession();
    return fetch(path, { ...init, headers: { Authorization: `Bearer ${data.session?.access_token ?? ""}`, "Content-Type": "application/json", ...init?.headers } });
  }, [requester]);

  const load = useCallback(async (preferCustom = false) => {
    setLoading(true); setError("");
    try {
      const editaisResponse = await request("/api/aluno/editais");
      if (editaisResponse.status === 401) { window.location.replace("/conta?modo=login&retorno=%2Fmeu-edital"); return; }
      const body = await editaisResponse.json();
      if (!editaisResponse.ok || !Array.isArray(body.editais)) throw new Error(body.message);
      const personalizedEditais: StudentExam[] = body.editais.filter((exam: StudentExam) => exam.tipo === "personalizado");
      setEditais(personalizedEditais);
      setSelected((current) => {
        if (personalizedEditais.some((exam: StudentExam) => exam.id === current)) return current;
        if (preferCustom) return personalizedEditais.find((exam: StudentExam) => exam.id !== "0")?.id ?? preferredExamId(personalizedEditais);
        return preferredExamId(personalizedEditais);
      });
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Não foi possível carregar seus editais."); }
    finally { setLoading(false); }
  }, [request]);

  const loadAvailableLaws = useCallback(async () => {
    if (availableLaws.length || availableLawsLoading) return;
    setAvailableLawsLoading(true);
    try {
      const response = await request("/api/aluno/minhas-leis", { cache: "no-store" });
      if (response.status === 401) { window.location.replace("/conta?modo=login&retorno=%2Fmeu-edital"); return; }
      const body = await response.json();
      if (!response.ok || !Array.isArray(body.leis)) throw new Error(body.message);
       setAvailableLaws(uniqueStudentLawsById(body.leis).filter((law) => !law.studyContexts || law.studyContexts.some((context) => context.recorteId === null && context.availability !== "coming_soon")));
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Não foi possível carregar as leis disponíveis."); }
    finally { setAvailableLawsLoading(false); }
  }, [availableLaws.length, availableLawsLoading, request]);

  useEffect(() => { void load(); }, [load]);
  const current = editais.find((exam) => exam.id === selected) ?? null;
  const isPersonalized = current?.tipo === "personalizado";
  const customExists = isPersonalized && current.id !== "0";
  const completedLaws = current?.leis.filter((law) => law.progress.unanswered === 0 && law.progress.correct + law.progress.errors > 0).length ?? 0;
  const selectableLaws = useMemo(() => availableLaws.filter((law) => !current?.leis.some((item) => item.id === law.id)), [availableLaws, current]);

  useEffect(() => { setName(isPersonalized ? current?.nome ?? "" : ""); setLawToAdd(""); }, [current?.id, current?.nome, isPersonalized]);

  async function change(action: string, payload: Record<string, unknown>) {
    setSaving(true); setError("");
    try { const response = await request("/api/aluno/editais", { method: "PATCH", body: JSON.stringify({ action, ...payload }) }); if (!response.ok) { const body = await response.json().catch(() => null) as { message?: string } | null; throw new Error(body?.message || "Não foi possível atualizar o edital."); } await load(action === "rename"); }
    catch (caught) { setError(caught instanceof Error ? caught.message : "Não foi possível atualizar o edital."); }
    finally { setSaving(false); }
  }
  async function saveName(event: FormEvent<HTMLFormElement>) { event.preventDefault(); const normalized = name.trim(); if (!normalized) { setError("Informe um nome para o edital."); return; } await change("rename", { nome: normalized }); }
  async function addLaw(event: FormEvent<HTMLFormElement>) { event.preventDefault(); const lawId = Number(lawToAdd); if (Number.isSafeInteger(lawId) && lawId > 0) await change("add", { leiId: lawId }); }
  async function move(index: number, direction: number) { if (!current || !isPersonalized) return; const ids = current.leis.map((law) => law.id); const target = index + direction; if (target < 0 || target >= ids.length) return; [ids[index], ids[target]] = [ids[target], ids[index]]; await change("reorder", { leiIds: ids }); }

  const Container = embedded ? "section" : "main";
  return <Container aria-label={embedded ? "Edital personalizado" : undefined} className={embedded ? (contained ? "" : "mt-6 rounded-3xl border border-blue-100 bg-white p-4 shadow-sm sm:p-6") : "mx-auto w-full max-w-4xl overflow-x-hidden px-4 py-8 sm:px-6 sm:py-10"}>
    {!embedded ? <header><h1 className="text-3xl font-black tracking-tight text-[#062a5f] sm:text-4xl">Meus Editais</h1></header> : null}
    {!embedded ? <StudentAreaTabs activeTab="edital" minhasLeisHref="/minhas-leis" meuEditalHref="/meu-edital" /> : null}
    {loading ? <p className="border-b border-slate-200 py-5 text-slate-600">Carregando seus editais…</p> : null}
    {error ? <p role="alert" className="mt-5 border-b border-red-200 py-4 text-red-700">{error}</p> : null}
    {!loading && !error ? <>
      {!current ? <p className="mt-6 border-b border-slate-200 pb-7 text-slate-600">Seu edital personalizado não está disponível agora.</p> : null}
      {current && isPersonalized && !customExists ? <section className="mt-6 max-w-lg border-b border-slate-200 pb-6"><h2 className="text-xl font-black text-[#062a5f]">Criar meu edital</h2><p className="mt-2 text-sm text-slate-600">Escolha um nome para organizar as leis que você já possui.</p><form onSubmit={(event) => void saveName(event)} className="mt-4 flex flex-col gap-3 sm:flex-row"><input value={name} onChange={(event) => setName(event.target.value)} maxLength={80} required placeholder="Ex.: PRF 2026" className="min-h-11 min-w-0 flex-1 rounded-lg border border-slate-300 px-3" /><button disabled={saving} className="min-h-11 rounded-lg bg-blue-700 px-4 font-black text-white disabled:opacity-50">Criar meu edital</button></form></section> : null}
      {current && customExists ? <section className="mt-6 min-w-0" aria-labelledby="exam-laws-title">
        <header className="flex min-w-0 items-center gap-4 border-b border-blue-100 pb-5"><span className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-blue-100 sm:h-16 sm:w-16"><Image src="/icons/flashcards-law.png" alt="" aria-hidden="true" width={44} height={44} className="h-9 w-9 object-contain sm:h-11 sm:w-11" /></span><div className="min-w-0"><p className="text-xs font-black uppercase tracking-[.12em] text-blue-700">Edital personalizado</p><h2 id="exam-laws-title" className="truncate text-2xl font-black tracking-tight text-[#062a5f] sm:text-3xl">{current.nome}</h2><p className="mt-1 text-sm font-semibold text-slate-600">{current.leis.length} {current.leis.length === 1 ? "lei no seu plano de estudo" : "leis no seu plano de estudo"}</p></div></header>
        <div className="pt-5"><div className="flex flex-col gap-4 border-b border-slate-200 pb-5 sm:flex-row sm:items-center sm:justify-between"><div className="flex items-center gap-3"><h3 className="text-xl font-black text-[#062a5f]">Leis do edital</h3><span aria-label={`${completedLaws} de ${current.leis.length} leis finalizadas`} className="grid h-7 min-w-10 place-items-center rounded-lg bg-blue-100 px-2 text-sm font-black text-blue-800">{completedLaws}/{current.leis.length}</span></div><form onSubmit={(event) => void saveName(event)} className="flex min-w-0 items-center gap-2"><label className="sr-only" htmlFor="exam-name">Nome do edital</label><input id="exam-name" value={name} onChange={(event) => setName(event.target.value)} maxLength={80} required className="min-h-10 min-w-0 flex-1 rounded-lg border border-slate-300 px-3 text-sm sm:w-52" /><button disabled={saving || name.trim() === current.nome} className="min-h-10 shrink-0 text-sm font-bold text-blue-700 disabled:text-slate-400">Salvar</button></form></div>
          <form onSubmit={(event) => void addLaw(event)} onFocusCapture={() => void loadAvailableLaws()} className="mt-4 grid min-w-0 gap-2 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-stretch"><label className="sr-only" htmlFor="exam-law">Adicionar lei ao edital</label><LawSearchSelect name="exam-law" value={lawToAdd} onChange={setLawToAdd} options={selectableLaws} emptyLabel={availableLawsLoading ? "Carregando leis disponíveis…" : "Adicionar lei ao edital"} placeholder="Pesquisar lei para adicionar…" className="min-w-0" /><button disabled={saving || !lawToAdd} className="min-h-11 whitespace-nowrap rounded-xl border border-blue-700 px-4 font-black text-blue-700 hover:bg-blue-50 disabled:border-slate-300 disabled:text-slate-400">＋ Adicionar lei</button></form>
          {current.leis.length === 0 ? <p className="py-7 text-sm text-slate-600">Adicione leis liberadas para montar seu edital.</p> : <><div className="mt-5 hidden grid-cols-[minmax(0,1fr)_minmax(220px,300px)_auto] gap-5 rounded-xl bg-slate-50 px-4 py-3 text-xs font-black uppercase tracking-wide text-slate-500 md:grid"><span>Lei</span><span>Progresso</span><span>Estudo</span></div><ol className="divide-y divide-slate-200">{current.leis.map((law, index) => {
          const label = `${law.titulo.trim() || `Lei ${law.id}`}${law.recorteNome ? ` — ${law.recorteNome}` : ""}`;
          const studyHref = law.recorteId ? `/questoes/${encodeURIComponent(law.slug)}/estudar?livre=1&recorte_id=${encodeURIComponent(law.recorteId)}` : `/estudar/lei/${encodeURIComponent(law.slug)}`;
          const fullLawHref = `/estudar/lei/${encodeURIComponent(law.slug)}?contexto=completo`;
          const campaignHref = `/questoes/${encodeURIComponent(law.slug)}/estudar${law.recorteId ? `?recorte_id=${encodeURIComponent(law.recorteId)}` : ""}`;
          const completed = law.campaignStatus === "concluida";
          const actionLabel = completed ? "Ver desempenho final" : law.campaignStatus === "em_andamento" ? "Continuar campanha" : "Iniciar campanha";
          const studyAction = <Link href={campaignHref} className="inline-flex min-h-11 w-full items-center justify-center rounded-xl border border-blue-700 px-4 py-2 text-sm font-black text-blue-700 hover:bg-blue-50 md:w-52">{actionLabel}</Link>;
          return <li key={law.id} className="grid min-w-0 gap-4 py-5 md:grid-cols-[minmax(0,1fr)_minmax(220px,300px)_auto] md:items-center md:gap-5"><div className="flex min-w-0 items-start gap-3"><span className="mt-0.5 grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-slate-100"><Image src="/icons/flashcards-law.png" alt="" aria-hidden="true" width={28} height={28} className="h-7 w-7 object-contain" /></span><div className="min-w-0">{onStudyLawSelect ? <><button type="button" onClick={() => onStudyLawSelect(law)} className="inline min-w-0 break-words text-left text-base font-black leading-5 text-[#062a5f] hover:text-blue-700">{label}</button><Link href={fullLawHref} aria-label={`Abrir ${label} completo em página própria`} className="ml-1 inline text-base font-black text-blue-700 hover:text-blue-900"><span aria-hidden="true">↗</span></Link></> : <Link href={studyHref} className="block min-w-0 break-words text-base font-black leading-5 text-[#062a5f] hover:text-blue-700">{label} <span aria-hidden="true">↗</span></Link>}<div className="mt-3 flex flex-wrap items-center gap-2"><span className="inline-flex overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm" aria-label="Reordenar lei"><button type="button" disabled={saving || index === 0} onClick={() => void move(index, -1)} aria-label={`Mover ${label} para cima`} title="Mover para cima" className="grid h-8 w-8 place-items-center border-r border-slate-200 text-base font-black text-blue-700 hover:bg-blue-50 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-300">↑</button><button type="button" disabled={saving || index === current.leis.length - 1} onClick={() => void move(index, 1)} aria-label={`Mover ${label} para baixo`} title="Mover para baixo" className="grid h-8 w-8 place-items-center text-base font-black text-blue-700 hover:bg-blue-50 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-300">↓</button></span><button type="button" disabled={saving} onClick={() => void change("remove", { leiId: law.id })} aria-label={`Remover ${label} do edital`} className="text-xs font-bold text-slate-500 underline underline-offset-2 hover:text-red-700 disabled:text-slate-300">Remover</button></div></div></div><div className="min-w-0 w-full"><ExamProgressBar progress={law.progress} /></div><div className="md:justify-self-end">{studyAction}</div>
          </li>;
         })}</ol></>}</div><p className="mt-4 text-sm text-slate-600">Clique na seta <span aria-hidden="true">↗</span> para acessar todos os recursos da lei e no nome da lei para colocá-la em foco.</p>
      </section> : null}
    </> : null}
  </Container>;
}

function ExamProgressBar({ progress }: { progress: StudentExam["leis"][number]["progress"] }) {
  const total = progress.correct + progress.errors + progress.unanswered;
  const completed = progress.correct + progress.errors;
  const percentage = total ? completed / total * 100 : 0;
  return <div className="mt-3 h-3 w-full overflow-hidden rounded-full bg-slate-200" role="progressbar" aria-label="Progresso de respostas da lei" aria-valuemin={0} aria-valuemax={100} aria-valuenow={percentage}><span className="block h-full rounded-full bg-blue-400 transition-[width]" style={{ width: `${percentage}%` }} /></div>;
}
