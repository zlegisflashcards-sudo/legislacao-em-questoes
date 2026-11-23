"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { LawStudyBottomNav } from "@/components/law-study-bottom-nav";

type Material = { title?: string; recorte?: { nome: string }; blocks?: { id: string; label: string; legislation: string }[]; message?: string };
export function ScopedStudyMaterial({ slug, recorteId, mode }: { slug: string; recorteId: string; mode: "reading" | "audio" }) {
  const [result, setResult] = useState<{ key: string; material?: Material; error?: string } | null>(null);
  const query = new URLSearchParams({ recorte_id: recorteId, mode });
  const key = `/api/aluno/estudar/lei/${encodeURIComponent(slug)}/recorte-material?${query}`;
  useEffect(() => {
    const controller = new AbortController();
    const login = () => window.location.replace(`/conta?modo=login&retorno=${encodeURIComponent(window.location.pathname + window.location.search)}`);
    void (async () => {
      const { data } = await supabase.auth.getSession();
      if (controller.signal.aborted) return;
      if (!data.session) return login();
      const response = await fetch(key, { headers: { Authorization: `Bearer ${data.session.access_token}` }, cache: "no-store", signal: controller.signal });
      if (controller.signal.aborted) return;
      if (response.status === 401) return login();
      const material = await response.json() as Material;
      if (!controller.signal.aborted) setResult(response.ok ? { key, material } : { key, error: material.message || "Não foi possível abrir este recorte." });
    })().catch(() => {
      if (!controller.signal.aborted) setResult({ key, error: "Não foi possível abrir este recorte." });
    });
    return () => controller.abort();
  }, [key]);
  const current = result?.key === key ? result : null;
  const material = current?.material;
  return <div className="pb-24 lg:pb-0">
    <main className="mx-auto max-w-4xl space-y-6 px-4 py-10">
      <h1 className="text-2xl font-bold">{mode === "audio" ? "LegisCast" : "Lei Interativa"}</h1>
      {material ? <p>{material.title} · {material.recorte?.nome}</p> : <p role="status">{current?.error || "Verificando o acesso ao recorte…"}</p>}
      {material && (mode === "audio" ? <p>Os áudios exclusivos deste recorte ainda não estão disponíveis.</p> :
        material.blocks?.length ? <><p>Exibimos apenas os blocos já preparados para este recorte.</p>{material.blocks.map((block) => <article id={`ref-${block.id}`} key={block.id} className="rounded-lg border p-4">
          <h2 className="mb-2 font-semibold">{block.label}</h2>
          <div dangerouslySetInnerHTML={{ __html: block.legislation }} />
        </article>)}</> : <p>O texto preparado deste recorte ainda não está disponível.</p>)}
    </main>
    <LawStudyBottomNav slug={slug} recorteId={recorteId} scopedReading={mode === "reading"} activeMode={mode === "audio" ? "legiscast" : "lei_interativa"} />
  </div>;
}
