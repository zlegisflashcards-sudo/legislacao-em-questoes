"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { LawDataFields, type AdminLawData } from "@/components/admin/law-data-fields";

export function LawDataAdmin({ law }: { law: (AdminLawData & { id: number }) | null }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [deletionSummary, setDeletionSummary] = useState<Record<string, unknown> | null>(null);
  const [deletionConfirmation, setDeletionConfirmation] = useState("");
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setMessage(""); setError("");
    const raw = Object.fromEntries(new FormData(event.currentTarget));
    const data = { ...raw, ordem: Number(raw.ordem), ...(law ? { acesso_gratuito: raw.acesso_gratuito === "true" } : {}), houve_alteracao_legislativa: raw.houve_alteracao_legislativa === "true" };
    try {
      const response = await fetch("/api/admin/comercial/leis", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: law ? "atualizar" : "criar", id: law?.id, data }) });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || "Não foi possível salvar a lei.");
      const nextSlug = typeof result.slug === "string" ? result.slug : String(raw.slug ?? "");
      if (!law && nextSlug) router.replace(`/admin/leis/${encodeURIComponent(nextSlug)}`);
      else { setMessage("Lei salva com sucesso."); if (law && nextSlug && nextSlug !== String(law.slug)) router.replace(`/admin/leis/${encodeURIComponent(nextSlug)}/dados`); else router.refresh(); }
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Não foi possível salvar a lei."); }
    finally { setBusy(false); }
  }
  async function previewDeletion() {
    if (!law) return; setBusy(true); setError(""); setMessage(""); setDeletionConfirmation("");
    try { const response = await fetch("/api/admin/comercial/leis", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "resumo_exclusao", id: law.id }) }); const result = await response.json().catch(() => ({})); if (!response.ok) throw new Error(result.error || "Não foi possível preparar a exclusão."); setDeletionSummary(result); }
    catch (caught) { setError(caught instanceof Error ? caught.message : "Não foi possível preparar a exclusão."); }
    finally { setBusy(false); }
  }
  async function deleteLaw() {
    if (!law || deletionConfirmation !== "EXCLUIR") return; setBusy(true); setError("");
    try { const response = await fetch("/api/admin/comercial/leis", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "excluir_definitivamente", id: law.id, data: { confirmacao: deletionConfirmation } }) }); const result = await response.json().catch(() => ({})); if (!response.ok) throw new Error(result.error || "Não foi possível excluir a lei."); router.replace("/admin/leis"); router.refresh(); }
    catch (caught) { setError(caught instanceof Error ? caught.message : "Não foi possível excluir a lei."); }
    finally { setBusy(false); }
  }
  const deletionStoragePaths = Array.isArray(deletionSummary?.storage_paths) ? deletionSummary.storage_paths.filter((path): path is string => typeof path === "string") : [];
  return <form className="commercial-card commercial-form-grid" onSubmit={submit}>
    <h2>{law ? "Dados da lei" : "Cadastrar nova lei"}</h2><p className="admin-questoes-wide mt-0 text-sm text-slate-600">Identificação, exibição e estado editorial usados pelos fluxos existentes.</p>
    <LawDataFields law={law} showFreeAccess={Boolean(law)} />
    {message ? <p className="admin-alert success" role="status">{message}</p> : null}
    {error ? <p className="admin-alert error" role="alert">{error}</p> : null}
    <div className="commercial-form-actions"><button className="admin-button primary" disabled={busy}>{busy ? "Salvando…" : law ? "Salvar alterações" : "Cadastrar lei"}</button>{law ? <button type="button" className="admin-button danger" disabled={busy} onClick={() => void previewDeletion()}>Excluir lei definitivamente</button> : null}</div>
    {deletionSummary && law ? <section className="admin-modal-backdrop" role="presentation"><div className="admin-modal" role="dialog" aria-modal="true" aria-labelledby="delete-law-title"><h2 id="delete-law-title">Excluir {String(law.titulo)} definitivamente?</h2><p>Esta operação removerá a lei do site, incluindo <strong>{Number(deletionSummary.structures_count ?? 0)} estrutura(s)</strong>, <strong>{Number(deletionSummary.questions_count ?? 0)} questão(ões)</strong>, <strong>{Number(deletionSummary.campaigns_count ?? 0)} campanha(s)</strong>, {Number(deletionSummary.answers_count ?? 0)} resposta(s) e {Number(deletionSummary.progresses_count ?? 0)} progresso(s).</p><p>Também removerá {Number(deletionSummary.materials_count ?? 0)} material(is), {Number(deletionSummary.recortes_count ?? 0)} recorte(s), {Number(deletionSummary.releases_count ?? 0)} liberação(ões), vínculos em produtos, editais e ligas. Produtos, compras e alunos serão preservados.</p><p className="admin-alert">Arquivos externos de materiais não são apagados. Os arquivos privados do LegisCast não são removidos silenciosamente fora da transação.</p>{deletionStoragePaths.length ? <details><summary>Arquivos privados do LegisCast que exigem limpeza operacional ({deletionStoragePaths.length})</summary><ul>{deletionStoragePaths.map((path) => <li key={path}><code>{path}</code></li>)}</ul></details> : null}<label>Digite <strong>EXCLUIR</strong> para confirmar.<input autoFocus value={deletionConfirmation} disabled={busy} onChange={(event) => setDeletionConfirmation(event.target.value)} /></label><div className="admin-modal-actions"><button type="button" className="admin-button secondary" disabled={busy} onClick={() => setDeletionSummary(null)}>Cancelar</button><button type="button" className="admin-button danger" disabled={busy || deletionConfirmation !== "EXCLUIR"} onClick={() => void deleteLaw()}>{busy ? "Excluindo…" : "Excluir lei e dados relacionados"}</button></div></div></section> : null}
  </form>;
}
