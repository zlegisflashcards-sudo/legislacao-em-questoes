"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { LawStudyBottomNav } from "@/components/law-study-bottom-nav";
import { CPP_PMAL_SCOPE_ID, CPP_PMAL_TITLES, type CppPmalReadingBlock } from "@/lib/legisbot/cpp-pmal-reading-policy";
import { supabase } from "@/lib/supabase";

export function CppPmalReadingClient() {
  const [blocks, setBlocks] = useState<CppPmalReadingBlock[] | null>(null);
  const [message, setMessage] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    const login = () => window.location.replace(`/conta?modo=login&retorno=${encodeURIComponent(window.location.pathname + window.location.search)}`);
    void (async () => {
      const { data } = await supabase.auth.getSession();
      if (controller.signal.aborted) return;
      const token = data.session?.access_token;
      if (!token) { login(); return; }
      const response = await fetch(`/api/legisbot/cpp/pmal-reading?recorte_id=${CPP_PMAL_SCOPE_ID}`, {
        cache: "no-store",
        headers: { Authorization: `Bearer ${token}` },
        signal: controller.signal,
      });
      const body = await response.json().catch(() => ({}));
      if (controller.signal.aborted) return;
      if (response.status === 401) { login(); return; }
      if (!response.ok || !Array.isArray(body.blocks)) {
        setMessage(body.message || "Não foi possível abrir este recorte.");
        return;
      }
      setBlocks(body.blocks);
    })().catch(() => { if (!controller.signal.aborted) setMessage("Não foi possível abrir este recorte."); });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (!blocks || !/^#(?:titulo-(?:608|609)|artigo-[a-f0-9-]{36})$/.test(window.location.hash)) return;
    document.getElementById(window.location.hash.slice(1))?.scrollIntoView();
  }, [blocks]);

  return <>
    <main className="mx-auto max-w-5xl px-4 pb-28 pt-8 sm:px-8 lg:pr-28">
      <header className="mb-6 rounded-2xl border border-slate-200 bg-white p-6">
        <p className="mb-2 text-sm font-semibold text-blue-800">Lei Interativa · Recorte PMAL Soldado</p>
        <h1 className="text-2xl font-bold text-slate-950">Código de Processo Penal</h1>
        <p className="mt-2 text-slate-700">Inquérito Policial e Ação Penal</p>
      </header>
      {message ? <p role="status">{message}</p> : !blocks ? <p role="status">Carregando artigos do recorte…</p> : <>
        <nav aria-label="Sumário do recorte" className="mb-8 space-y-2 rounded-xl border border-slate-200 bg-white p-4">
          {CPP_PMAL_TITLES.map((title) => (
            <details className="rounded-lg border border-slate-100 p-3" key={title.id}>
              <summary className="cursor-pointer font-semibold text-blue-900">{title.label} · {title.articles}</summary>
              <a className="mt-2 inline-block text-sm underline" href={`#titulo-${title.id}`}>Ir ao início do título</a>
              <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-2">
                {blocks.filter((block) => block.structureId === title.id).map((block) => (
                  <li key={block.id}><a className="text-sm text-blue-800 underline" href={`#artigo-${block.id}`}>{block.label}</a></li>
                ))}
              </ul>
            </details>
          ))}
          <Link href={`/estudar/lei/cpp?recorte_id=${CPP_PMAL_SCOPE_ID}`} className="inline-block pt-2 text-blue-800 underline">Praticar com questões do recorte</Link>
        </nav>
        {CPP_PMAL_TITLES.map((title) => (
          <section key={title.id} id={`titulo-${title.id}`} className="mb-8 scroll-mt-24 space-y-3">
            <h2 className="text-xl font-bold text-slate-950">{title.label}</h2>
            {blocks.filter((block) => block.structureId === title.id).map((block) => (
              <article id={`artigo-${block.id}`} key={block.id} className="scroll-mt-24 overflow-x-auto rounded-xl border border-slate-200 bg-white p-4 text-slate-900 sm:p-6">
                <h3 className="mb-3 font-bold">{block.label}</h3>
                <div className="space-y-2 leading-relaxed" dangerouslySetInnerHTML={{ __html: block.html }} />
              </article>
            ))}
          </section>
        ))}
      </>}
    </main>
    <LawStudyBottomNav slug="cpp" recorteId={CPP_PMAL_SCOPE_ID} activeMode="lei_interativa" />
  </>;
}
