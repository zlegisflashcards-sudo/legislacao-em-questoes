"use client";

import { useEffect, useRef, useState } from "react";

type Props = { studentId: string; disabled?: boolean; onBusyChange: (busy: boolean) => void };

export function accessEmailSuccessMessage(sentAt: unknown) {
  const date = typeof sentAt === "string" ? new Date(sentAt) : null;
  if (!date || !Number.isFinite(date.getTime())) return "E-mail de acesso enviado. Horário indisponível.";
  const time = new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit" }).format(date);
  return `E-mail de acesso enviado às ${time}.`;
}

export default function StudentAccessEmailAction({ studentId, disabled = false, onBusyChange }: Props) {
  const [sending, setSending] = useState(false);
  const [success, setSuccess] = useState("");
  const [error, setError] = useState("");
  const pending = useRef(false);
  const generation = useRef(0);

  useEffect(() => {
    generation.current += 1;
    pending.current = false;
    setSending(false);
    setSuccess("");
    setError("");
    return () => {
      generation.current += 1;
      if (pending.current) onBusyChange(false);
      pending.current = false;
    };
  }, [studentId, onBusyChange]);

  const send = async () => {
    if (disabled || pending.current) return;
    pending.current = true;
    const currentGeneration = generation.current;
    setSending(true);
    setSuccess("");
    setError("");
    onBusyChange(true);
    try {
      const response = await fetch("/api/admin/comercial/alunos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "enviar_email_acesso", id: studentId }),
      });
      const body = await response.json();
      if (!response.ok || body.sent !== true) throw new Error(body.error || "O serviço não confirmou o envio do e-mail de acesso.");
      if (generation.current === currentGeneration) setSuccess(accessEmailSuccessMessage(body.sentAt));
    } catch (cause) {
      if (generation.current === currentGeneration) setError(cause instanceof Error ? cause.message : "Falha ao enviar e-mail de acesso.");
    } finally {
      if (generation.current === currentGeneration) {
        pending.current = false;
        setSending(false);
        onBusyChange(false);
      }
    }
  };

  return <div>
    <button className="admin-button primary" type="button" disabled={disabled || sending} aria-busy={sending} onClick={() => void send()}>
      {sending ? "Enviando…" : "Enviar e-mail de acesso"}
    </button>
    {success ? <p className="admin-alert success" role="status">{success}<br /><small>Envio aceito pelo serviço de e-mail. Não confirma entrega na caixa de entrada ou leitura. Horário local.</small></p> : null}
    {error ? <p className="admin-alert error" role="alert">{error}</p> : null}
  </div>;
}
