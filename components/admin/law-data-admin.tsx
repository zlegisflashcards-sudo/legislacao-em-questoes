"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { LawDataFields, type AdminLawData } from "@/components/admin/law-data-fields";

export function LawDataAdmin({ law }: { law: (AdminLawData & { id: number }) | null }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setMessage(""); setError("");
    const raw = Object.fromEntries(new FormData(event.currentTarget));
    const data = { ...raw, ordem: Number(raw.ordem), ativo: raw.ativo === "true", ...(law ? { acesso_gratuito: raw.acesso_gratuito === "true" } : {}), houve_alteracao_legislativa: raw.houve_alteracao_legislativa === "true" };
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
  return <form className="commercial-card commercial-form-grid" onSubmit={submit}>
    <h2>{law ? "Dados da lei" : "Cadastrar nova lei"}</h2><p className="admin-questoes-wide mt-0 text-sm text-slate-600">Identificação, exibição e estado editorial usados pelos fluxos existentes.</p>
    <LawDataFields law={law} showFreeAccess={Boolean(law)} />
    {message ? <p className="admin-alert success" role="status">{message}</p> : null}
    {error ? <p className="admin-alert error" role="alert">{error}</p> : null}
    <div className="commercial-form-actions"><button className="admin-button primary" disabled={busy}>{busy ? "Salvando…" : law ? "Salvar alterações" : "Cadastrar lei"}</button></div>
  </form>;
}
