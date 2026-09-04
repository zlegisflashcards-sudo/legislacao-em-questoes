"use client";

import { FormEvent, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

type Law = { id: number; slug: string; titulo: string };
type Audio = { id: string; titulo: string; ordem: number; ativo: boolean; leis?: { titulo?: string } | null };
type AuthorizeResponse = { path: string; uploadToken: string; operationToken: string };

async function readResponse(response: Response) { const text = await response.text(); try { return JSON.parse(text) as Record<string, unknown>; } catch { return { error: text || "Não foi possível concluir a operação." }; } }
function apiError(body: Record<string, unknown>, fallback: string) { return typeof body.error === "string" ? body.error : fallback; }

export function LegiscastAudiosAdmin() {
  const [laws, setLaws] = useState<Law[]>([]); const [audios, setAudios] = useState<Audio[]>([]); const [busy, setBusy] = useState(false); const [message, setMessage] = useState(""); const [error, setError] = useState("");
  async function load() { const response = await fetch("/api/admin/legiscast-audios", { cache: "no-store" }); const body = await readResponse(response); if (!response.ok) throw new Error(apiError(body, "Não foi possível carregar os áudios.")); setLaws(Array.isArray(body.laws) ? body.laws as Law[] : []); setAudios(Array.isArray(body.audios) ? body.audios as Audio[] : []); }
  useEffect(() => { void load().catch((caught) => setError(caught instanceof Error ? caught.message : "Não foi possível carregar os áudios.")); }, []);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = event.currentTarget; const values = new FormData(form); const file = values.get("file"); setBusy(true); setError(""); setMessage("");
    try {
      if (!(file instanceof File)) throw new Error("Selecione um arquivo MP3 ou M4A.");
      const authorizeResponse = await fetch("/api/admin/legiscast-audios", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ operation: "authorize", lawId: values.get("lei_id"), fileName: file.name, mime: file.type, sizeBytes: file.size }) });
      const authorizeBody = await readResponse(authorizeResponse); if (!authorizeResponse.ok) throw new Error(apiError(authorizeBody, "Não foi possível autorizar o envio do áudio."));
      const authorization = authorizeBody as unknown as AuthorizeResponse; if (!authorization.path || !authorization.uploadToken || !authorization.operationToken) throw new Error("Autorização de upload inválida.");
      const directUpload = await supabase.storage.from("legiscast-audio").uploadToSignedUrl(authorization.path, authorization.uploadToken, file, { contentType: file.type });
      if (directUpload.error) throw new Error("Não foi possível enviar o áudio ao armazenamento privado.");
      const finalizeResponse = await fetch("/api/admin/legiscast-audios", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ operation: "finalize", lawId: values.get("lei_id"), path: authorization.path, operationToken: authorization.operationToken, titulo: values.get("titulo"), descricao: values.get("descricao"), ordem: values.get("ordem"), duracaoSegundos: values.get("duracao_segundos"), ativo: values.get("ativo") === "true" }) });
      const finalizeBody = await readResponse(finalizeResponse); if (!finalizeResponse.ok) throw new Error(apiError(finalizeBody, "Não foi possível vincular o áudio à lei."));
      form.reset(); setMessage("Áudio enviado e vinculado à lei."); await load();
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Não foi possível enviar o áudio."); } finally { setBusy(false); }
  }
  return <section className="commercial-card"><h2>Áudios do LegisCast</h2><p>Envie somente MP3 ou M4A já otimizados para voz: mono e 64–96 kbps. O sistema valida formato e limite de 100 MB; bitrate e canais devem ser conferidos antes do envio.</p><form className="commercial-form-grid" onSubmit={(event) => void submit(event)}><select name="lei_id" required defaultValue=""><option value="" disabled>Selecione a lei</option>{laws.map((law) => <option key={law.id} value={law.id}>{law.titulo}</option>)}</select><input name="titulo" required placeholder="Título da faixa" /><textarea name="descricao" placeholder="Descrição opcional" /><input name="ordem" type="number" min="0" defaultValue="0" /><input name="duracao_segundos" type="number" min="0" placeholder="Duração em segundos (opcional)" /><label>Arquivo MP3 ou M4A<input name="file" type="file" accept="audio/mpeg,audio/mp4,.mp3,.m4a" required /></label><select name="ativo" defaultValue="true"><option value="true">Ativo</option><option value="false">Inativo</option></select><button className="admin-button primary" disabled={busy}>{busy ? "Enviando…" : "Enviar áudio"}</button></form>{error ? <p className="admin-alert error" role="alert">{error}</p> : null}{message ? <p className="admin-alert success" role="status">{message}</p> : null}<ul className="mt-6 grid gap-2">{audios.map((audio) => <li key={audio.id} className="rounded-lg border border-slate-200 px-3 py-2"><strong>{audio.titulo}</strong> · {audio.leis?.titulo ?? "Lei"} · ordem {audio.ordem} · {audio.ativo ? "ativo" : "inativo"}</li>)}</ul></section>;
}
