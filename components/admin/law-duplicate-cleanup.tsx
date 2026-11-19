"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

type Question = { id: string; ordem: string; pergunta: string };
export type LawDuplicatePreview = {
  law: string; title: string; token: string; total: number; activeCount: number;
  groups: Array<{ retained: Question; candidates: Question[] }>;
};
const CONFIRMATION = "INATIVAR DUPLICATAS DO BARALHO";

async function request(body: Record<string, unknown>) {
  const response = await fetch("/api/admin/artigos/conflitos", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || "Não foi possível confirmar o resultado. Atualize os conflitos antes de tentar novamente.");
  return result;
}

export function LawDuplicateCleanup({ law }: { law: string }) {
  const router = useRouter();
  const [preview, setPreview] = useState<LawDuplicatePreview | null>(null);
  const [confirmation, setConfirmation] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const pending = useRef(false);
  const generation = useRef(0);
  useEffect(() => {
    generation.current += 1;
    setPreview(null); setConfirmation(""); setError(""); setSuccess("");
    return () => { generation.current += 1; };
  }, [law]);

  async function prepare() {
    if (pending.current || !law) return;
    pending.current = true; setBusy(true); setError(""); setSuccess(""); setConfirmation(""); setPreview(null);
    const current = generation.current;
    try {
      const result = await request({ action: "previsualizar_duplicatas_baralho", law }) as LawDuplicatePreview;
      if (current === generation.current) setPreview(result);
    } catch (cause) { if (current === generation.current) setError(cause instanceof Error ? cause.message : "Não foi possível gerar a prévia."); }
    finally { pending.current = false; setBusy(false); }
  }

  async function apply() {
    if (!preview || preview.law !== law || confirmation !== CONFIRMATION || pending.current) return;
    pending.current = true; setBusy(true); setError("");
    const current = generation.current;
    try {
      const result = await request({ action: "inativar_duplicatas_baralho", law, token: preview.token, confirmation });
      if (current === generation.current) {
        setPreview(null); setConfirmation("");
        setSuccess(`${result.applied} cópia(s) inativada(s) em ${result.groups} grupo(s). Uma questão por assertiva foi mantida. As cópias podem ser reativadas na gestão de questões.`);
        router.refresh();
      }
    } catch (cause) {
      if (current === generation.current) {
        setPreview(null); setConfirmation("");
        setError(cause instanceof Error ? cause.message : "Resultado não confirmado. Atualize os conflitos antes de tentar novamente.");
      }
    } finally { pending.current = false; setBusy(false); }
  }

  return <section className="commercial-card grid gap-4" aria-label="Duplicatas de todo o baralho">
    <div className="grid gap-1"><p className="admin-eyebrow">REVISÃO DO BARALHO</p><h3 className="font-bold">Duplicatas de todo o baralho</h3><p className="text-sm text-slate-600">Analisa todas as páginas da lei, independentemente do filtro atual. A duplicata é a mesma assertiva no mesmo baralho raiz; gabarito e justificativa não entram na comparação.</p></div>
    <button type="button" className="admin-button secondary w-full" disabled={busy || !law} onClick={() => void prepare()}>{busy ? "Analisando o baralho…" : "Revisar todas as duplicatas do baralho"}</button>
    {error ? <p className="admin-alert error" role="alert">{error}</p> : null}
    {success ? <p className="admin-alert" role="status">{success}</p> : null}
    {preview ? <section role="dialog" aria-modal="false" aria-labelledby="duplicate-cleanup-title" className="grid gap-5 rounded-2xl border border-amber-300 bg-amber-50/50 p-5 shadow-sm">
      <header className="grid gap-1 border-b border-amber-200 pb-4"><p className="admin-eyebrow text-amber-800">CONFIRMAÇÃO NECESSÁRIA</p><h4 id="duplicate-cleanup-title" className="text-lg font-bold text-slate-900">Preparar inativação de cópias</h4><p className="text-sm text-slate-700">Revise o impacto antes de confirmar. Nenhuma questão foi alterada nesta prévia.</p></header>
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-amber-200 bg-white p-3"><span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Grupos</span><strong className="mt-1 block text-2xl text-slate-900">{preview.groups.length}</strong><span className="text-sm text-slate-600">assertivas repetidas</span></div>
        <div className="rounded-xl border border-red-200 bg-red-50 p-3"><span className="text-xs font-semibold uppercase tracking-wide text-red-700">Inativar</span><strong className="mt-1 block text-2xl text-red-800">{preview.total}</strong><span className="text-sm text-red-700">cópia(s) duplicada(s)</span></div>
        <div className="rounded-xl border border-slate-200 bg-white p-3"><span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Analisadas</span><strong className="mt-1 block text-2xl text-slate-900">{preview.activeCount}</strong><span className="text-sm text-slate-600">questões ativas</span></div>
      </div>
      <section className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-950"><h5 className="font-bold">Não é exclusão definitiva</h5><p className="mt-1">O menor UUID de cada grupo permanecerá ativo. As cópias não serão excluídas: UUIDs, respostas dos alunos, histórico e vínculos continuam nos registros originais e podem ser reativados depois.</p></section>
      <details className="rounded-xl border border-slate-200 bg-white p-4"><summary className="cursor-pointer font-semibold text-slate-800">Ver {preview.groups.length} grupo(s), assertivas e UUIDs</summary><ul className="mt-3 grid max-h-80 gap-3 overflow-auto pr-1">{preview.groups.map((group, index) => <li key={group.retained.id} className="grid gap-2 rounded-lg border border-slate-200 p-3 break-all">
        <p className="text-sm font-semibold text-slate-800">Grupo {index + 1}</p>
        <p className="text-sm"><strong>Manter:</strong> <code>{group.retained.id}</code> · ordem <code>{group.retained.ordem}</code></p>
        <p className="whitespace-pre-wrap text-sm text-slate-700">{group.retained.pergunta.replace(/<[^>]*>/g, " ")}</p>
        <p className="text-sm text-red-800"><strong>Inativar:</strong> {group.candidates.map((question) => <code key={question.id} className="mr-2 inline-block">{question.id}</code>)}</p>
      </li>)}</ul></details>
      {preview.total ? <div className="grid gap-3 rounded-xl border border-slate-300 bg-white p-4"><label className="grid gap-2 text-sm font-semibold text-slate-800">Para liberar a ação, digite <code className="select-all rounded bg-slate-100 px-1 py-0.5">{CONFIRMATION}</code><input className="font-normal" aria-label="Confirmação da limpeza" placeholder={CONFIRMATION} value={confirmation} disabled={busy} onChange={(event) => setConfirmation(event.target.value)} autoComplete="off" /></label><p className="text-sm text-slate-600">A confirmação deve ser idêntica ao texto acima. Esta ação só inativa cópias; não transfere dados entre questões.</p></div> : <p className="admin-alert">Nenhuma duplicata ativa encontrada neste baralho.</p>}
      <footer className="flex flex-wrap-reverse justify-end gap-3 border-t border-amber-200 pt-4"><button type="button" className="admin-button secondary" disabled={busy} onClick={() => { setPreview(null); setConfirmation(""); }}>Cancelar</button>{preview.total ? <button type="button" className="admin-button danger" disabled={busy || confirmation !== CONFIRMATION} onClick={() => void apply()}>{busy ? "Inativando cópias…" : `Confirmar inativação de ${preview.total} cópia(s)`}</button> : null}</footer>
    </section> : null}
  </section>;
}
