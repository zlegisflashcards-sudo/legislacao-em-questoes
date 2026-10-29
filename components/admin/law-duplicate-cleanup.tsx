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

  return <section className="commercial-card grid gap-3" aria-label="Duplicatas de todo o baralho">
    <h3 className="font-bold">Duplicatas de todo o baralho</h3>
    <p>Revisa todas as páginas deste baralho, independentemente do filtro atual. Duplicata é a mesma assertiva na mesma lei/baralho raiz; gabarito e justificativa não entram na comparação.</p>
    <button type="button" className="admin-button secondary" disabled={busy || !law} onClick={() => void prepare()}>{busy ? "Processando…" : "Revisar todas as duplicatas do baralho"}</button>
    {error ? <p role="alert">{error}</p> : null}
    {success ? <p role="status">{success}</p> : null}
    {preview ? <section role="dialog" aria-modal="false" aria-label="Confirmar limpeza de duplicatas" className="grid gap-3 rounded-xl border border-amber-300 p-4">
      <h4 className="font-bold">{preview.title}: {preview.groups.length} grupo(s), {preview.total} cópia(s) para inativar</h4>
      <p>{preview.activeCount} questões ativas analisadas em todo o baralho. Será mantido o menor UUID de cada grupo, seguindo o critério existente. Confira os UUIDs abaixo antes de confirmar.</p>
      <p><strong>Não é exclusão definitiva.</strong> As cópias deixam de aparecer nas questões ativas, mas seus UUIDs, respostas dos alunos, histórico e vínculos permanecem nos registros originais. Nada é transferido para a questão mantida. É possível reativar as cópias na gestão de questões.</p>
      <details><summary>Ver todos os grupos e UUIDs</summary><ul className="max-h-80 overflow-auto">{preview.groups.map((group) => <li key={group.retained.id} className="my-3 break-all">
        <p><strong>Manter:</strong> {group.retained.id} · {group.retained.ordem}</p>
        <p className="whitespace-pre-wrap">{group.retained.pergunta.replace(/<[^>]*>/g, " ")}</p>
        <p><strong>Inativar:</strong> {group.candidates.map((question) => question.id).join(", ")}</p>
      </li>)}</ul></details>
      {preview.total ? <><label className="grid gap-1">Digite {CONFIRMATION}<input aria-label="Confirmação da limpeza" value={confirmation} disabled={busy} onChange={(event) => setConfirmation(event.target.value)} autoComplete="off" /></label>
        <button type="button" className="admin-button" disabled={busy || confirmation !== CONFIRMATION} onClick={() => void apply()}>Confirmar inativação de {preview.total} cópia(s)</button></> : <p>Nenhuma duplicata ativa encontrada neste baralho.</p>}
      <button type="button" className="admin-button secondary" disabled={busy} onClick={() => { setPreview(null); setConfirmation(""); }}>Cancelar</button>
    </section> : null}
  </section>;
}
