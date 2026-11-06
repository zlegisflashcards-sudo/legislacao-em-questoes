"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

type Payload = { content: { titulo: string }; topicLabel: string; questions: Array<{ assunto: string | null; pergunta: string; justificativa: string | null; resumo: string | null }>; fallbackToBase?: boolean };

export function DoctrineStudyPageClient({ slug, questao, ordem }: { slug: string; questao?: string; ordem?: string }) {
  const [payload, setPayload] = useState<Payload | null>(null);
  const [error, setError] = useState("");
  useEffect(() => { void (async () => {
    const { data } = await supabase.auth.getSession(); const token = data.session?.access_token;
    if (!token) { window.location.replace(`/conta?modo=login&retorno=${encodeURIComponent(window.location.pathname + window.location.search)}`); return; }
    const query = new URLSearchParams(); if (questao) query.set("questao", questao); if (ordem) query.set("ordem", ordem);
    const response = await fetch(`/api/doutrina/${encodeURIComponent(slug)}${query.size ? `?${query}` : ""}`, { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" });
    const result = await response.json().catch(() => ({})); if (!response.ok) throw new Error(result.message || "Não foi possível abrir esta disciplina."); setPayload(result);
  })().catch((caught) => setError(caught instanceof Error ? caught.message : "Não foi possível abrir esta disciplina.")); }, [slug, questao, ordem]);
  if (error) return <main className="mx-auto max-w-4xl p-6 text-red-700">{error}</main>;
  if (!payload) return <main className="mx-auto max-w-4xl p-6">Carregando disciplina.</main>;
  return <main className="mx-auto max-w-4xl p-6"><h1 className="text-3xl font-black">{payload.content.titulo}</h1>{payload.fallbackToBase ? <p className="mt-3 rounded border border-amber-200 bg-amber-50 p-3">O tópico não está disponível; você foi mantido na página base da disciplina.</p> : null}{payload.questions.map((question, index) => <article key={index} className="mt-5 rounded-xl border p-5"><p className="font-bold">{question.assunto || payload.topicLabel}</p><div className="mt-3">{question.pergunta}</div>{question.justificativa ? <div className="mt-4">{question.justificativa}</div> : null}{question.resumo ? <div className="mt-4">{question.resumo}</div> : null}</article>)}</main>;
}
