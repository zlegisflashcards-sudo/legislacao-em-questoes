"use client";

import { useEffect, useMemo, useState } from "react";
import { StudentAreaTabs } from "@/components/student-area-tabs";
import {
  DEFAULT_LAW_STUDY_PLATFORM,
  LAW_STUDY_PLATFORM_IDS,
  LAW_STUDY_PLATFORMS,
  lawHistoryDate,
  lawMaterialActionLabel,
  lawMaterialIcon,
  lawStudyProgressMessage,
  nextLawStudyProgress,
  type LawStudyData,
  type LawStudyHistoryItem,
  type LawStudyPlatformId,
} from "@/lib/law-study";
import { getAnkiYoutubeEmbedUrl } from "@/lib/anki-study";
import { resolveLawStudyPlatformTutorials, type AnkiTutorialSettings } from "@/lib/anki-tutorial-settings";
import { supabase } from "@/lib/supabase";
import { originalFileNameFromDisposition } from "@/lib/law-material-download";

type LoadStatus = "loading" | "ready" | "error";
type LawStudyResponse = { success?: boolean; study?: LawStudyData; message?: string };

export function LawStudyPageClient({ slug, ankiTutorialSettings, publicStudy }: { slug: string; ankiTutorialSettings: AnkiTutorialSettings | null; publicStudy?: LawStudyData }) {
  const [status, setStatus] = useState<LoadStatus>(publicStudy ? "ready" : "loading");
  const [study, setStudy] = useState<LawStudyData | null>(publicStudy ?? null);
  const [message, setMessage] = useState("");
  const [activeStudyPlatform, setActiveStudyPlatform] = useState<LawStudyPlatformId>(DEFAULT_LAW_STUDY_PLATFORM);
  const [showAllHistory, setShowAllHistory] = useState(false);

  useEffect(() => {
    if (publicStudy) return;
    let active = true;
    async function load() {
      try {
        const { data, error } = await supabase.auth.getSession();
        if (error) throw error;
        const token = data.session?.access_token;
        if (!token) {
          window.location.replace(`/conta?modo=login&retorno=${encodeURIComponent(`/estudar/lei/${slug}`)}`);
          return;
        }
        const response = await fetch(`/api/aluno/estudar/lei/${encodeURIComponent(slug)}`, {
          cache: "no-store",
          headers: { Authorization: `Bearer ${token}` },
        });
        const result = await response.json() as LawStudyResponse;
        if (response.status === 401) {
          window.location.replace(`/conta?modo=login&retorno=${encodeURIComponent(`/estudar/lei/${slug}`)}`);
          return;
        }
        if (!response.ok || !result.study) throw new Error(result.message || "Não foi possível carregar esta lei.");
        if (!active) return;
        setStudy(result.study);
        setStatus("ready");
      } catch (error) {
        if (!active) return;
        setMessage(error instanceof Error ? error.message : "Não foi possível carregar esta lei.");
        setStatus("error");
      }
    }
    void load();
    return () => { active = false; };
  }, [slug, publicStudy]);

  if (status === "loading") return <PageFrame publicMode={Boolean(publicStudy)}><div role="status" className="rounded-2xl border border-blue-100 bg-white p-8 text-slate-600 shadow-sm">Verificando sua sessão e o acesso à lei…</div></PageFrame>;
  if (status === "error" || !study) return <PageFrame publicMode={Boolean(publicStudy)}><div role="alert" className="rounded-2xl border border-red-200 bg-white p-8 text-red-700 shadow-sm"><p>{message || "Não foi possível carregar esta lei."}</p><button type="button" onClick={() => window.location.reload()} className="mt-4 rounded-xl bg-blue-700 px-5 py-3 font-black text-white">Tentar novamente</button></div></PageFrame>;

  return <PageFrame publicMode={Boolean(publicStudy)}>
    <div className="grid min-w-0 gap-6">
      <LawHeader study={study} />
      <LawStudyTutorial activePlatform={activeStudyPlatform} onPlatformChange={setActiveStudyPlatform} settings={ankiTutorialSettings} />
      <MaterialsSection study={study} publicMode={Boolean(publicStudy)} />
      {!publicStudy ? <><StudyGuidance /><LawProgress slug={study.law.slug} progress={study.progress} onSaved={(progress) => setStudy((current) => current ? { ...current, progress } : current)} /><HistorySection history={study.history} showAll={showAllHistory} onShowAll={() => setShowAllHistory(true)} /></> : null}
    </div>
  </PageFrame>;
}

function PageFrame({ children, publicMode = false }: { children: React.ReactNode; publicMode?: boolean }) {
  return <div className="mx-auto w-full max-w-6xl px-4 py-10 sm:px-6 sm:py-14">
    {!publicMode ? <StudentAreaTabs activeTab="leis" minhasLeisHref="/minhas-leis" /> : null}
    {children}
  </div>;
}

function LawHeader({ study }: { study: LawStudyData }) {
  return <header className="rounded-3xl border border-blue-100 bg-white p-6 shadow-sm sm:p-8">
    <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
      <span aria-hidden="true" className="flex h-20 w-20 shrink-0 items-center justify-center rounded-2xl bg-blue-50 text-4xl sm:h-24 sm:w-24">⚖️</span>
      <div className="min-w-0">
        {study.law.code ? <p className="text-xs font-black uppercase tracking-wide text-blue-700">{study.law.code}</p> : null}
        <h1 className="mt-1 break-words text-3xl font-black tracking-tight text-[#062a5f] sm:text-4xl">{study.law.title}</h1>
        {study.law.shortName ? <p className="mt-2 text-sm font-semibold text-slate-500">{study.law.shortName}</p> : null}
        {study.law.totalFlashcards > 0 ? <p className="mt-3 font-bold text-slate-700">{study.law.totalFlashcards} flashcards</p> : null}
      </div>
    </div>
  </header>;
}

function LawStudyTutorial({ activePlatform, onPlatformChange, settings }: { activePlatform: LawStudyPlatformId; onPlatformChange: (platform: LawStudyPlatformId) => void; settings: AnkiTutorialSettings | null }) {
  const tutorials = useMemo(() => resolveLawStudyPlatformTutorials(settings), [settings]);
  const hasTutorial = LAW_STUDY_PLATFORM_IDS.some((platform) => getAnkiYoutubeEmbedUrl(tutorials[platform]));
  const embedUrl = useMemo(() => getAnkiYoutubeEmbedUrl(tutorials[activePlatform]), [activePlatform, tutorials]);
  if (!hasTutorial) return null;
  return <section aria-labelledby="law-study-guidance-title" className="overflow-hidden rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-8">
    <h2 id="law-study-guidance-title" className="text-2xl font-black text-[#062a5f]">Como estudar esta lei</h2>
    <p className="mt-2 text-slate-600">Escolha sua plataforma para ver a orientação sobre o material e as questões desta página.</p>
    <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4" aria-label="Plataformas do tutorial da página de estudo">
      {LAW_STUDY_PLATFORM_IDS.map((platformId) => {
        const selected = platformId === activePlatform;
        const unavailable = platformId === "navegador";
        return <button key={platformId} type="button" disabled={unavailable} aria-pressed={selected} onClick={() => onPlatformChange(platformId)} className={`min-h-12 rounded-xl border px-4 py-3 font-black transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700 ${unavailable ? "cursor-not-allowed border-slate-200 bg-slate-100 text-slate-400" : selected ? "border-blue-700 bg-blue-700 text-white" : "border-slate-300 bg-white text-slate-700 hover:border-blue-400 hover:bg-blue-50"}`}>{LAW_STUDY_PLATFORMS[platformId].label}</button>;
      })}
    </div>
    {embedUrl ? <iframe key={activePlatform} src={embedUrl} title={`Como estudar esta lei no ${LAW_STUDY_PLATFORMS[activePlatform].label}`} className="mt-5 aspect-video w-full" loading="lazy" referrerPolicy="strict-origin-when-cross-origin" allow="accelerometer; encrypted-media; gyroscope; picture-in-picture" allowFullScreen /> : null}
  </section>;
}

function MaterialsSection({ study, publicMode = false }: { study: LawStudyData; publicMode?: boolean }) {
  const [downloadingId, setDownloadingId] = useState<number | null>(null);
  const [downloadErrors, setDownloadErrors] = useState<Record<number, string>>({});

  async function accessMaterial(material: LawStudyData["materials"][number]) {
    if (material.accessUrl) {
      window.open(material.accessUrl, "_blank", "noopener,noreferrer");
      return;
    }
    setDownloadingId(material.id);
    setDownloadErrors((current) => ({ ...current, [material.id]: "" }));
    try {
      if (publicMode) {
        const response = await fetch(`/api/tutorial/amostra/materiais/${material.id}/download`, { cache: "no-store" });
        if (!response.ok) throw new Error("Material temporariamente indisponível.");
        const blob = await response.blob(); const disposition = response.headers.get("content-disposition") ?? ""; const fileName = originalFileNameFromDisposition(disposition) ?? `material-${material.id}`; const objectUrl = URL.createObjectURL(blob); const link = document.createElement("a"); link.href = objectUrl; link.download = fileName; document.body.appendChild(link); link.click(); link.remove(); URL.revokeObjectURL(objectUrl); return;
      }
      const { data, error } = await supabase.auth.getSession();
      if (error) throw error;
      const token = data.session?.access_token;
      if (!token) {
        window.location.replace(`/conta?modo=login&retorno=${encodeURIComponent(`/estudar/lei/${study.law.slug}`)}`);
        return;
      }
      const response = await fetch(`/api/aluno/estudar/lei/${encodeURIComponent(study.law.slug)}/materiais/${material.id}/download`, {
        cache: "no-store",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (response.status === 401) {
        window.location.replace(`/conta?modo=login&retorno=${encodeURIComponent(`/estudar/lei/${study.law.slug}`)}`);
        return;
      }
      if (!response.ok) {
        const result = await response.json().catch(() => null) as { message?: string } | null;
        throw new Error(result?.message || "Material temporariamente indisponível.");
      }
      const blob = await response.blob();
      const disposition = response.headers.get("content-disposition") ?? "";
      const fileName = originalFileNameFromDisposition(disposition) ?? `material-${material.id}`;
      const objectUrl = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = objectUrl;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(objectUrl);
    } catch (error) {
      setDownloadErrors((current) => ({ ...current, [material.id]: error instanceof Error ? error.message : "Material temporariamente indisponível." }));
    } finally {
      setDownloadingId(null);
    }
  }

  return <section aria-labelledby="law-materials-title" className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-8">
    <h2 id="law-materials-title" className="text-2xl font-black text-[#062a5f]">Materiais desta lei</h2>
    {study.materials.length === 0 ? <p className="mt-4 rounded-2xl bg-slate-50 p-5 text-slate-600">Nenhum material disponível no momento.</p> : <div className="mt-5 grid gap-4">
      {study.materials.map((material) => <article key={material.id} className="flex min-w-0 flex-col gap-4 rounded-2xl border border-slate-200 p-5 sm:flex-row sm:items-center">
        <span aria-hidden="true" className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-2xl">{lawMaterialIcon(material.type)}</span>
        <div className="min-w-0 flex-1"><h3 className="break-words text-lg font-black text-[#062a5f]">{material.title}</h3>{material.description ? <p className="mt-1 text-sm leading-relaxed text-slate-600">{material.description}</p> : null}<div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs font-bold text-slate-500">{material.itemCount !== null ? <span>{material.itemCount} itens</span> : null}{material.version ? <span>Versão {material.version}</span> : null}</div></div>
        <div className="shrink-0 sm:max-w-64">
          {material.accessAvailable ? <button type="button" disabled={downloadingId !== null} onClick={() => void accessMaterial(material)} className="min-h-11 w-full rounded-xl bg-blue-700 px-5 py-3 text-center font-black text-white transition hover:bg-blue-600 disabled:cursor-wait disabled:opacity-60">{downloadingId === material.id ? "Preparando download…" : lawMaterialActionLabel(material)}</button> : <button type="button" disabled title="Referência de arquivo ausente ou inválida" className="min-h-11 w-full rounded-xl bg-slate-200 px-5 py-3 text-center font-black text-slate-500">Material temporariamente indisponível</button>}
          {downloadErrors[material.id] ? <p role="alert" className="mt-2 text-sm font-semibold text-red-700">{downloadErrors[material.id]}</p> : null}
        </div>
      </article>)}
    </div>}
  </section>;
}

function StudyGuidance() {
  return <aside className="rounded-3xl border border-amber-200 bg-amber-50 p-6 text-slate-800 shadow-sm sm:p-8"><p className="text-xs font-black uppercase tracking-wide text-amber-800">Orientação de estudo</p><p className="mt-2 text-lg font-black">Mantenha suas revisões em dia antes de avançar para novos cartões.</p></aside>;
}

function LawProgress({ slug, progress, onSaved }: { slug: string; progress: LawStudyData["progress"]; onSaved: (progress: LawStudyData["progress"]) => void }) {
  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const progressMessage = lawStudyProgressMessage(progress);

  async function save(next: LawStudyData["progress"]) {
    setSaving(true);
    setErrorMessage("");
    try {
      const { data, error } = await supabase.auth.getSession();
      if (error) throw error;
      const token = data.session?.access_token;
      if (!token) {
        window.location.replace(`/conta?modo=login&retorno=${encodeURIComponent(`/estudar/lei/${slug}`)}`);
        return;
      }
      const response = await fetch(`/api/aluno/estudar/lei/${encodeURIComponent(slug)}/progresso`, {
        method: "PATCH",
        cache: "no-store",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify(next),
      });
      if (response.status === 401) {
        window.location.replace(`/conta?modo=login&retorno=${encodeURIComponent(`/estudar/lei/${slug}`)}`);
        return;
      }
      const result = await response.json() as { progress?: LawStudyData["progress"]; message?: string };
      if (!response.ok || !result.progress) throw new Error(result.message || "Não foi possível salvar seu progresso.");
      onSaved(result.progress);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Não foi possível salvar seu progresso.");
    } finally {
      setSaving(false);
    }
  }

  return <section aria-labelledby="law-progress-title" className="rounded-3xl border border-blue-200 bg-[#eaf3ff] p-6 sm:p-8">
    <h2 id="law-progress-title" className="text-2xl font-black text-[#062a5f]">Progresso nesta lei</h2>
    <div className="mt-5 grid gap-3">
      <label className="flex min-h-12 cursor-pointer items-center gap-3 rounded-xl border border-blue-200 bg-white px-4 py-3 font-bold text-slate-800">
        <input type="checkbox" checked={progress.inStudy} disabled={saving} onChange={(event) => void save(nextLawStudyProgress(progress, "inStudy", event.target.checked))} className="h-5 w-5 shrink-0 accent-blue-700" />
        <span>Lei em estudo</span>
      </label>
      <label className="flex min-h-12 cursor-pointer items-center gap-3 rounded-xl border border-blue-200 bg-white px-4 py-3 font-bold text-slate-800">
        <input type="checkbox" checked={progress.questionsFinished} disabled={saving} onChange={(event) => void save(nextLawStudyProgress(progress, "questionsFinished", event.target.checked))} className="h-5 w-5 shrink-0 accent-blue-700" />
        <span>Finalizei todas as questões da lei</span>
      </label>
    </div>
    {progressMessage ? <p aria-live="polite" className="mt-3 text-sm font-semibold leading-6 text-blue-800">{progressMessage}</p> : null}
    {saving ? <p role="status" className="mt-3 text-sm font-bold text-blue-700">Salvando progresso…</p> : null}
    {errorMessage ? <p role="alert" className="mt-3 text-sm font-bold text-red-700">{errorMessage}</p> : null}
  </section>;
}

function HistorySection({ history, showAll, onShowAll }: { history: LawStudyHistoryItem[]; showAll: boolean; onShowAll: () => void }) {
  const visible = showAll ? history : history.slice(0, 3);
  return <details className="group rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
    <summary className="cursor-pointer list-none text-2xl font-black text-[#062a5f] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-blue-700">Histórico de atualizações <span aria-hidden="true" className="ml-2 inline-block text-blue-700 transition group-open:rotate-180">⌄</span></summary>
    <div className="mt-5 border-t border-slate-100 pt-5">
      {history.length === 0 ? <p className="text-slate-600">Nenhuma atualização publicada para alunos no momento.</p> : <div className="grid gap-4">{visible.map((item) => <HistoryItem key={item.id} item={item} />)}{!showAll && history.length > 3 ? <button type="button" onClick={onShowAll} className="min-h-11 justify-self-start rounded-xl border border-blue-700 px-5 py-3 font-black text-blue-700 transition hover:bg-blue-50">Ver atualizações anteriores</button> : null}</div>}
    </div>
  </details>;
}

function HistoryItem({ item }: { item: LawStudyHistoryItem }) {
  return <article className="rounded-2xl border border-slate-200 p-5">
    <div className="flex flex-wrap items-center gap-2 text-xs font-black uppercase tracking-wide"><span className="text-blue-700">{lawHistoryDate(item.publishedAt)}</span><span className="rounded-full bg-blue-50 px-2.5 py-1 text-blue-800">{item.type.replaceAll("_", " ")}</span><span className="rounded-full bg-slate-100 px-2.5 py-1 text-slate-700">{item.importance}</span></div>
    <h3 className="mt-3 text-lg font-black text-[#062a5f]">{item.title}</h3>
    {item.summary ? <p className="mt-2 text-sm leading-relaxed text-slate-600">{item.summary}</p> : null}
    <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-sm font-semibold text-slate-500">{item.version ? <span>Versão {item.version}</span> : null}{item.legalReference ? <span>Referência: {item.legalReference}</span> : null}</div>
  </article>;
}
