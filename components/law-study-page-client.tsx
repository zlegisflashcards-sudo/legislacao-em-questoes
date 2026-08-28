"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { StudentAreaTabs } from "@/components/student-area-tabs";
import { CampaignPerformanceDonut } from "@/components/campaign-performance-donut";
import { getAnkiYoutubeEmbedUrl } from "@/lib/anki-study";
import { resolveLawStudyPlatformTutorials, type AnkiTutorialSettings } from "@/lib/anki-tutorial-settings";
import { LAW_STUDY_PLATFORMS, type LawStudyData, type LawStudyMaterial } from "@/lib/law-study";
import { compareQuestionStructureNames } from "@/lib/questoes-structure";
import { competitiveCampaignPerformance } from "@/lib/law-campaign-attempt-performance";
import { supabase } from "@/lib/supabase";

type CampaignLevel = { chave: string; concluido: boolean };
type Campaign = { status: "nao_iniciada" | "em_andamento" | "concluida"; progress: number; bestScore?: number | null; record?: { score: number; correct: number; errors: number } | null; result?: { position?: number | null }; levels?: CampaignLevel[] };
type StructureQuestion = { id: string; structure_id: number | null };
type StructureNode = { id: number; parent_id: number | null; nome: string; ordem: number };
type QuestionSourceLaw = { slug: string; questions: StructureQuestion[]; structure?: StructureNode[] };

export function LawStudyPageClient({ slug, ankiTutorialSettings, publicStudy }: { slug: string; ankiTutorialSettings: AnkiTutorialSettings | null; publicStudy?: LawStudyData }) {
  const [study, setStudy] = useState<LawStudyData | null>(publicStudy ?? null);
  const [campaign, setCampaign] = useState<Campaign | null>(publicStudy ? { status: "nao_iniciada", progress: 0 } : null);
  const [sourceLaw, setSourceLaw] = useState<QuestionSourceLaw | null>(null);
  const [error, setError] = useState("");
  const [resetOpen, setResetOpen] = useState(false);
  const [resetting, setResetting] = useState(false);

  async function request(path: string, method = "GET") {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token) { window.location.replace(`/conta?modo=login&retorno=${encodeURIComponent(`/estudar/lei/${slug}`)}`); return null; }
    const response = await fetch(path, { method, headers: { Authorization: `Bearer ${token}` }, cache: "no-store" });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.message || "Não foi possível carregar esta lei.");
    return result;
  }

  useEffect(() => {
    if (publicStudy) return;
    void (async () => {
      try {
        const [law, state, structure] = await Promise.all([
          request(`/api/aluno/estudar/lei/${encodeURIComponent(slug)}`),
          request(`/api/aluno/estudar/lei/${encodeURIComponent(slug)}/campanha`),
          request(`/api/questoes/estrutura?slug=${encodeURIComponent(slug)}`),
        ]);
        if (law?.study) setStudy(law.study);
        if (state) setCampaign(state);
        const found = Array.isArray(structure?.laws) ? structure.laws.find((item: QuestionSourceLaw) => item.slug === slug) : null;
        if (!found) throw new Error("Não foi possível carregar a estrutura desta lei.");
        setSourceLaw(found);
      } catch (caught) { setError(caught instanceof Error ? caught.message : "Não foi possível carregar esta lei."); }
    })();
  }, [slug, publicStudy]);

  async function reset() {
    setResetting(true);
    try { await request(`/api/aluno/estudar/lei/${encodeURIComponent(slug)}/campanha`, "DELETE"); setCampaign((current) => ({ status: "nao_iniciada", progress: 0, levels: [], bestScore: current?.bestScore, record: current?.record })); setResetOpen(false); }
    catch (caught) { setError(caught instanceof Error ? caught.message : "Não foi possível resetar o Estudo Ativo da Lei."); }
    finally { setResetting(false); }
  }

  if (error) return <Frame publicMode={Boolean(publicStudy)}><p className="rounded-2xl border border-red-200 bg-white p-6 text-red-700">{error}</p></Frame>;
  if (!study || !campaign || (!publicStudy && !sourceLaw)) return <Frame publicMode={Boolean(publicStudy)}><p className="rounded-2xl border bg-white p-6 text-slate-600">Carregando sua lei…</p></Frame>;
  const completed = campaign.status === "concluida";
  const statusLabel = completed ? "Concluída" : campaign.status === "em_andamento" ? "Em andamento" : "Não iniciada";
  const modeLabel = completed ? "Estudo Livre" : "Estudo Ativo da Lei";
  const progress = completed ? 100 : campaign.progress;
  const tree = sourceLaw ? buildTree(sourceLaw.structure ?? [], sourceLaw.questions) : [];
  return <Frame publicMode={Boolean(publicStudy)}><div className="grid min-w-0 gap-5 sm:gap-6">
    <header className="min-w-0 rounded-3xl border border-blue-100 bg-white p-4 shadow-sm sm:p-7">
      {study.law.code ? <p className="text-xs font-black uppercase tracking-wide text-blue-700">{study.law.code}</p> : null}
      <h1 className="mt-2 break-words text-3xl font-black tracking-tight text-[#062a5f] sm:text-4xl">{study.law.title}</h1>
      {study.law.shortName ? <p className="mt-2 text-slate-500">{study.law.shortName}</p> : null}
      <div className="mt-5 grid min-w-0 gap-4 rounded-2xl bg-blue-50 p-4 sm:mt-6 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end sm:p-5"><div className="min-w-0"><p className="text-sm font-black text-[#062a5f]">{modeLabel}</p><p className="mt-1 text-sm text-slate-600">Status: {statusLabel}</p><div className="mt-4 h-2 overflow-hidden rounded-full bg-blue-100"><span className="block h-full rounded-full bg-blue-700" style={{ width: `${progress}%` }} /></div><p className="mt-2 text-sm font-bold text-slate-700">{progress}% concluído</p></div>{!completed ? <Link href={`/questoes/${encodeURIComponent(slug)}/estudar`} className="inline-flex min-h-12 w-full items-center justify-center rounded-xl bg-blue-700 px-5 py-3 font-black text-white hover:bg-blue-600 sm:w-auto">{campaign.status === "em_andamento" ? "Continuar estudo" : "Começar estudo"}</Link> : null}</div>
    </header>
    <section className="min-w-0 rounded-3xl border border-slate-200 bg-white p-4 shadow-sm sm:p-7"><div className="flex min-w-0 flex-col gap-4 sm:flex-row sm:items-end sm:justify-between"><div className="min-w-0"><p className="text-sm font-black uppercase tracking-wide text-blue-700">{modeLabel}</p><h2 className="mt-1 text-2xl font-black text-[#062a5f]">Estrutura da lei</h2><p className="mt-2 text-sm text-slate-600">{completed ? "Escolha um capítulo para estudar livremente, sem alterar seu Estudo Ativo da Lei." : "A sequência do Estudo Ativo da Lei é definida automaticamente conforme seu progresso."}</p></div>{completed && tree.length > 0 ? <Link href={`/questoes/${encodeURIComponent(slug)}/estudar?livre=1`} className="inline-flex min-h-11 w-full items-center justify-center rounded-xl border border-blue-700 px-4 py-2 font-black text-blue-700 hover:bg-blue-50 sm:w-auto">Estudar lei inteira</Link> : null}</div><div className="mt-5 min-w-0 overflow-hidden rounded-2xl border border-slate-200"><div className="hidden items-center gap-3 border-b border-slate-200 bg-slate-50 px-4 py-3 text-xs font-black uppercase tracking-wide text-slate-500 sm:flex"><span className="flex-1">Nível</span><span>Questões</span></div>{tree.length ? tree.map((node) => <StructureTreeNode key={node.id} node={node} slug={slug} completed={completed} campaignLevels={campaign.levels ?? []} />) : <RootDeck study={study} slug={slug} count={sourceLaw?.questions.length ?? 0} completed={completed} campaignStatus={campaign.status} />}</div></section>
    {(completed || campaign.status === "em_andamento" || campaign.record) ? <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7"><h2 className="text-xl font-black text-[#062a5f]">Estudo Ativo da Lei</h2><p className="mt-2 text-sm text-slate-600">{completed ? "Seu Estudo Ativo da Lei foi concluído. O estudo livre não altera score, ranking ou progresso histórico." : campaign.record ? "Seu recorde permanece disponível durante novas tentativas e após o reset." : "O score é exibido somente ao concluir a lei."}</p>{campaign.record ? <div className="mt-3 grid gap-1 text-sm font-black text-[#062a5f]"><p>Melhor score: {campaign.record.score.toLocaleString("pt-BR")}</p><CampaignPerformanceDonut compact {...competitiveCampaignPerformance(campaign.record.correct, campaign.record.errors)} />{completed ? <p>Posição no ranking: {typeof campaign.result?.position === "number" ? `${campaign.result.position}º lugar` : "Ainda sem posição no ranking"}</p> : null}</div> : null}{!publicStudy ? <button type="button" onClick={() => setResetOpen(true)} className="mt-4 text-sm font-bold text-blue-700 underline underline-offset-4">Resetar Estudo Ativo da Lei</button> : null}</section> : null}
    <Materials study={study} settings={ankiTutorialSettings} publicMode={Boolean(publicStudy)} />
  </div>{resetOpen ? <ResetModal saving={resetting} onCancel={() => setResetOpen(false)} onConfirm={() => void reset()} /> : null}</Frame>;
}

function Frame({ children, publicMode }: { children: React.ReactNode; publicMode: boolean }) { return <main className="mx-auto w-full max-w-5xl overflow-x-hidden px-3 py-6 sm:px-6 sm:py-10">{!publicMode ? <StudentAreaTabs activeTab="leis" minhasLeisHref="/minhas-leis" /> : null}{children}</main>; }
type TreeNode = { id: number; nome: string; count: number; children: TreeNode[] };
function buildTree(structure: StructureNode[], questions: StructureQuestion[]): TreeNode[] { const byParent = new Map<number | null, StructureNode[]>(); for (const node of structure) byParent.set(node.parent_id, [...(byParent.get(node.parent_id) ?? []), node]); const descendants = (node: StructureNode): number[] => [node.id, ...(byParent.get(node.id) ?? []).flatMap(descendants)]; const toNode = (node: StructureNode): TreeNode => { const ids = new Set(descendants(node)); return { id: node.id, nome: node.nome, count: questions.filter((question) => question.structure_id !== null && ids.has(question.structure_id)).length, children: [...(byParent.get(node.id) ?? [])].sort(compareQuestionStructureNames).map(toNode) }; }; return [...(byParent.get(null) ?? [])].sort(compareQuestionStructureNames).map(toNode); }
type ProgressionPhase = "concluida" | "atual" | "futura";
function progressionPhase(related: CampaignLevel[], levels: CampaignLevel[], completed: boolean): ProgressionPhase { if (completed || (related.length > 0 && related.every((item) => item.concluido))) return "concluida"; const current = levels.find((item) => !item.concluido); return current && related.some((item) => item.chave === current.chave) ? "atual" : "futura"; }
function ProgressionLabel({ name, count, phase }: { name: string; count: number; phase: ProgressionPhase }) { const visual = phase === "concluida" ? { icon: "✓", row: "bg-emerald-50/70", iconClass: "text-emerald-700", nameClass: "text-emerald-900" } : phase === "atual" ? { icon: "▶", row: "bg-blue-50 ring-1 ring-inset ring-blue-200", iconClass: "text-blue-700", nameClass: "text-[#062a5f]" } : { icon: "🔒", row: "bg-slate-50 opacity-65", iconClass: "text-slate-400", nameClass: "text-slate-500" }; return <div className={`flex min-h-12 min-w-0 flex-1 items-start gap-2 rounded-xl px-2 py-2 sm:items-center ${visual.row}`}><span className={`mt-0.5 shrink-0 text-base font-black sm:mt-0 ${visual.iconClass}`} aria-hidden="true">{visual.icon}</span><span className={`min-w-0 flex-1 break-words font-bold leading-5 ${visual.nameClass}`}>{name}</span><span className="mt-1 shrink-0 self-start text-sm font-bold text-slate-500 sm:mt-0 sm:self-center">{count} {count === 1 ? "questão" : "questões"}</span></div>; }
function FreeStudyLabel({ name, count }: { name: string; count: number }) { return <div className="flex min-h-12 min-w-0 flex-1 items-start gap-2 rounded-xl border border-blue-100 bg-white px-3 py-2 transition-colors group-hover:border-blue-300 group-hover:bg-blue-50 sm:items-center"><span className="min-w-0 flex-1 break-words font-bold leading-5 text-[#075bc1] group-hover:text-[#062a5f]">{name}</span><span className="mt-1 shrink-0 self-start text-sm font-bold text-blue-700 sm:mt-0 sm:self-center">{count} {count === 1 ? "questão" : "questões"}</span></div>; }
function StructureTreeNode({ node, slug, completed, campaignLevels, depth = 0 }: { node: TreeNode; slug: string; completed: boolean; campaignLevels: CampaignLevel[]; depth?: number }) { const [open, setOpen] = useState(depth < 1); const descendants = (item: TreeNode): number[] => [item.id, ...item.children.flatMap(descendants)]; const related = campaignLevels.filter((item) => descendants(node).some((id) => item.chave === `estrutura:${id}`)); const phase = progressionPhase(related, campaignLevels, completed); const label = completed ? <FreeStudyLabel name={node.nome} count={node.count} /> : <ProgressionLabel name={node.nome} count={node.count} phase={phase} />; const href = `/questoes/${encodeURIComponent(slug)}/estudar?livre=1&structure_id=${node.id}`; return <div className="border-b border-slate-100 last:border-b-0"><div className="flex min-h-16 min-w-0 items-start gap-2 px-3 py-3 sm:items-center sm:gap-3 sm:px-4" style={{ paddingLeft: `${12 + depth * 12}px` }}>{node.children.length ? <button type="button" onClick={() => setOpen((value) => !value)} className="mt-1 h-9 w-9 shrink-0 rounded-lg text-lg font-black text-slate-600 hover:bg-slate-100 sm:mt-0" aria-label={open ? "Recolher nível" : "Expandir nível"}>{open ? "−" : "+"}</button> : null}{completed ? <Link href={href} className="group flex min-w-0 flex-1 items-start gap-2 rounded-lg py-1 sm:items-center sm:gap-3">{label}</Link> : <div className="flex min-w-0 flex-1 items-start gap-2 py-1 sm:items-center sm:gap-3">{label}</div>}</div>{open ? node.children.map((child) => <StructureTreeNode key={child.id} node={child} slug={slug} completed={completed} campaignLevels={campaignLevels} depth={depth + 1} />) : null}</div>; }
function RootDeck({ study, slug, count, completed, campaignStatus }: { study: LawStudyData; slug: string; count: number; completed: boolean; campaignStatus: Campaign["status"] }) { const phase: ProgressionPhase = campaignStatus === "em_andamento" ? "atual" : "futura"; const label = completed ? <FreeStudyLabel name={study.law.title} count={count} /> : <ProgressionLabel name={study.law.title} count={count} phase={phase} />; const href = `/questoes/${encodeURIComponent(slug)}/estudar?livre=1`; return <div className="flex min-h-16 min-w-0 items-start gap-2 px-3 py-3 sm:items-center sm:gap-3 sm:px-4">{completed ? <Link href={href} className="group flex min-w-0 flex-1 items-start gap-2 rounded-lg py-1 sm:items-center sm:gap-3">{label}</Link> : <div className="flex min-w-0 flex-1 items-start gap-2 py-1 sm:items-center sm:gap-3">{label}</div>}</div>; }

function Materials({ study, settings, publicMode }: { study: LawStudyData; settings: AnkiTutorialSettings | null; publicMode: boolean }) {
  const [open, setOpen] = useState(false); const [downloading, setDownloading] = useState<number | null>(null);
  const flashcard = study.materials.find((item) => item.type === "flashcards" && item.accessAvailable); const pdf = study.materials.find((item) => item.type === "pdf" && item.accessAvailable);
  async function download(material: LawStudyMaterial) { setDownloading(material.id); try { if (publicMode) { window.location.href = `/api/tutorial/amostra/materiais/${material.id}/download`; return; } const { data } = await supabase.auth.getSession(); const token = data.session?.access_token; if (!token) throw new Error("Sessão expirada."); const response = await fetch(`/api/aluno/estudar/lei/${encodeURIComponent(study.law.slug)}/materiais/${material.id}/download`, { headers: { Authorization: `Bearer ${token}` } }); if (!response.ok) throw new Error("Não foi possível baixar o material."); const blob = await response.blob(); const link = document.createElement("a"); link.href = URL.createObjectURL(blob); link.download = material.type === "pdf" ? "Legislação esquematizada.pdf" : "Legislação em questões.apkg"; link.click(); URL.revokeObjectURL(link.href); } finally { setDownloading(null); } }
  return <section className="min-w-0 rounded-3xl border border-slate-200 bg-white p-4 shadow-sm sm:p-7"><h2 className="text-2xl font-black text-[#062a5f]">Materiais</h2><p className="mt-2 text-slate-600">Materiais complementares desta lei. Prefere estudar no Anki?</p><div className="mt-5 grid gap-3 sm:flex sm:flex-wrap">{flashcard ? <button type="button" onClick={() => setOpen(true)} className="min-h-12 w-full rounded-xl border border-blue-700 px-5 py-3 font-black text-blue-700 hover:bg-blue-50 sm:w-auto">Estudar no Anki</button> : null}{pdf ? <button type="button" disabled={downloading === pdf.id} onClick={() => void download(pdf)} className="min-h-12 w-full rounded-xl border border-slate-300 px-5 py-3 font-black text-slate-800 hover:bg-slate-50 disabled:opacity-50 sm:w-auto">{downloading === pdf.id ? "Baixando…" : "Baixar PDF"}</button> : null}</div>{open && flashcard ? <AnkiModal settings={settings} onClose={() => setOpen(false)} onDownload={() => void download(flashcard)} downloading={downloading === flashcard.id} /> : null}</section>;
}
function AnkiModal({ settings, onClose, onDownload, downloading }: { settings: AnkiTutorialSettings | null; onClose: () => void; onDownload: () => void; downloading: boolean }) { const tutorials = useMemo(() => resolveLawStudyPlatformTutorials(settings), [settings]); const [platform, setPlatform] = useState<keyof typeof tutorials>("computador"); const video = getAnkiYoutubeEmbedUrl(tutorials[platform]); return <div className="fixed inset-0 z-50 flex items-end bg-slate-950/60 p-3 sm:items-center sm:justify-center sm:p-4"><section role="dialog" aria-modal="true" className="max-h-[92dvh] w-full max-w-2xl overflow-y-auto rounded-3xl bg-white p-5 sm:p-6"><h2 className="text-2xl font-black text-[#062a5f]">Estudar no Anki</h2><p className="mt-2 text-slate-600">Escolha sua plataforma, veja a orientação e baixe o baralho quando quiser.</p><div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-4">{(Object.keys(tutorials) as Array<keyof typeof tutorials>).map((item) => <button key={item} disabled={item === "navegador"} onClick={() => setPlatform(item)} className={platform === item ? "min-h-11 rounded-lg bg-blue-700 p-3 font-bold text-white" : "min-h-11 rounded-lg border p-3 font-bold disabled:opacity-50"}>{LAW_STUDY_PLATFORMS[item].label}</button>)}</div>{video ? <iframe className="mt-5 aspect-video w-full" src={video} title="Tutorial do Anki" allowFullScreen /> : null}<div className="mt-5 grid gap-3 sm:grid-cols-2"><button disabled={downloading} onClick={onDownload} className="min-h-12 w-full rounded-xl bg-blue-700 px-5 py-3 font-black text-white disabled:opacity-50">{downloading ? "Baixando arquivo…" : "Baixar deck (.apkg)"}</button><button onClick={onClose} className="min-h-12 w-full rounded-xl border px-5 py-3 font-black">Fechar</button></div></section></div>; }
function ResetModal({ saving, onCancel, onConfirm }: { saving: boolean; onCancel: () => void; onConfirm: () => void }) { return <div className="fixed inset-0 z-50 flex items-end bg-slate-950/60 p-4 sm:items-center sm:justify-center"><section role="dialog" aria-modal="true" className="w-full max-w-md rounded-3xl bg-white p-6"><h2 className="text-2xl font-black text-[#062a5f]">Resetar Estudo Ativo da Lei?</h2><p className="mt-3 text-slate-600">Seu progresso atual será reiniciado. Seus scores e Estudos Ativos da Lei anteriores continuarão salvos.</p><div className="mt-6 grid gap-3 sm:grid-cols-2"><button disabled={saving} onClick={onCancel} className="min-h-11 rounded-xl border px-5 py-3 font-black">Cancelar</button><button disabled={saving} onClick={onConfirm} className="min-h-11 rounded-xl bg-red-700 px-5 py-3 font-black text-white">{saving ? "Resetando…" : "Resetar Estudo Ativo da Lei"}</button></div></section></div>; }
